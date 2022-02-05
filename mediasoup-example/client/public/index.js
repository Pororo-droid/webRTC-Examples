var mediasoup = require('mediasoup-client');
var socket_client = require('socket.io-client');

let rtp_capabilities;
let device;
let producer;
let transport;

let local_stream;
let remote_stream;

const socketPromise = function(socket) {
    return function request(type, data = {}) {
        return new Promise((resolve) => {
            socket.emit(type, data, resolve);
        });
    }
};
const server_url = `http://localhost:3000`;
socket = socket_client(server_url);
socket.request = socketPromise(socket);

socket.on('connection-success',({socketId}) => {
    console.log(socketId);
})

async function getUserMedia(){
    stream = await navigator.mediaDevices.getUserMedia( {video: true} );
    return stream;
}

// LocalStream 가져오기
// 구독 실행
async function localStream(){

    local_stream = await getUserMedia();
    const track = local_stream.getVideoTracks()[0];
    const params = { track };
    producer = await transport.produce(params);
    // console.log(transport);
    // subscribe();
}

// Transport 생성
// Local Stream 불러오기
async function createProduceTransport(transport_data){
    transport = device.createSendTransport(transport_data);
    transport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        socket.request('connectProducerTransport', { dtlsParameters })
        .then(callback)
        .catch(errback);
    });
    
    transport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
            const { id } = await socket.request('produce', {
            transportId: transport.id,
            kind,
            rtpParameters,
          });
          callback({ id });
        } catch (err) {
          errback(err);
        }
    });

    transport.on('connectionstatechange', (state) => {
        console.log("Produce Transport State Changed to : ",state);
        if(state == "connected"){
            let local_video = document.getElementById('localVideo');
            local_video.srcObject = local_stream;
        }
    });
    
    console.log("Produce Transport Created");
}

// RTP Capabilities를 받아와서 Device생성. 
// Transport Data를 받아온다.
// createTransport 함수를 호출한다.
socket.on('getRtpCapabilities',async (data) =>{
    console.log("RTP Capabailities : ",data.rtpCapabilities);
    rtp_capabilities = data.rtpCapabilities;

    await createDevice(rtp_capabilities);
    
    const transport_data = await socket.request('createProducerTransport', {});
    console.log("Produce Transport",transport_data);

    await createProduceTransport(transport_data);

    await localStream();

    await subscribe();
})

async function createDevice(rtp_capabilities){
    try {
        device = new mediasoup.Device()
        await device.load({
          routerRtpCapabilities: rtp_capabilities
        })
    
        console.log('RTP Capabilities Device : ', device.rtpCapabilities)
    } catch (error) {
        console.log(error)
        if (error.name === 'UnsupportedError')
          console.warn('browser not supported')
    }
}

async function subscribe(){
    const data = await socket.request('createConsumerTransport',{
        forceTcp: false,
    });
    if (data.error) {
        console.error(data.error);
        return;
    }

    const consume_transport = device.createRecvTransport(data);
    consume_transport.on('connect', ({ dtlsParameters }, callback, errback) => {
    socket.request('connectConsumerTransport', {
      transportId: transport.id,
      dtlsParameters
    })
      .then(callback)
      .catch(errback);
    });

    consume_transport.on('connectionstatechange', async (state) => {
        console.log("Produce Transport changed to : ",state)
        if(state == "connected"){
            let remote_video = document.getElementById("remoteVideo");
            remote_video.srcObject = await remote_stream;
            // document.querySelector('#remote_video').srcObject = await stream;
            await socket.request('resume');
        }
      });
    
    remote_stream = consume(consume_transport);
}

async function consume(consume_transport){
    const { rtpCapabilities } = device;
    const data = await socket.request('consume', { rtpCapabilities });
    const {
        producerId,
        id,
        kind,
        rtpParameters,
    } = data;

    let codecOptions = {};
    const consumer = await consume_transport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
        codecOptions,
    });
    const stream = new MediaStream();
    stream.addTrack(consumer.track);
    return stream;
}
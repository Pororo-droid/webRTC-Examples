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

// 5. LocalStream 가져오기
// 해당 내용은 webRTC와 동일함.
async function localStream(){

    local_stream = await getUserMedia();
    const track = local_stream.getVideoTracks()[0];
    const params = { track };
    producer = await transport.produce(params);
    // console.log(transport);
    // subscribe();
}

// 4. Transport 생성
// 서버에서 받아온 producer transport의 params를 이용하여
// 미디어를 보낼 transport를 생성한다.
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

// 1. 서버 라우터의 rtp capabilites를 받아와서 아래 내용을 처리.
// 해당 버전에서는 init()처럼 사용된다. => 수정필요.
socket.on('getRtpCapabilities',async (data) =>{
    console.log("RTP Capabailities : ",data.rtpCapabilities);
    rtp_capabilities = data.rtpCapabilities;

    await createDevice(rtp_capabilities);
    
    // 3. Producer Transport가 없다면, 서버측에 Producer Transport를
    // 생성할것을 요청, 콜백을 통해 producer transport의 params를 가져온다
    const transport_data = await socket.request('createProducerTransport', {});
    console.log("Produce Transport",transport_data);

    await createProduceTransport(transport_data);

    await localStream();

    await subscribe();
})

// 2. 새로운 Device를 생성
// device.load()를 통해 라우터의 정보를 알아낸다.
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

// 6. 이제 서버에서 받아온다.
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
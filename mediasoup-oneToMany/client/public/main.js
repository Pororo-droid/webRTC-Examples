var mediasoup = require('mediasoup-client');
var socket_client = require('socket.io-client');

const socketPromise = function(socket) {
    return function request(type,data = {}){
        return new Promise((resolve) => {
            socket.emit(type, data, resolve);
        })
    }
}

let rtp_capabilities;
let transport_data;
let producer_transport;
let producer;

let consumer_list = []
let remote_stream_list = []

let local_stream;

const server_url = `http://localhost:3000`;
const socket = socket_client(server_url);
socket.request = socketPromise(socket)

socket.on("connection-success",async ({socketId}) => {
    console.log(socketId);

    // 1. 서버 라우터의 rtp capabilites를 받아와서 아래 내용을 처리.
    await getRtpCapabilities();

    // 2. 새로운 Device를 생성
    // device.load()를 통해 라우터의 정보를 알아낸다.
    await createDevice();

    // 3. Producer Transport가 없다면, 서버측에 Producer Transport를
    // 생성할것을 요청, 콜백을 통해 producer transport의 params를 가져온다
    await getTransportData();
    
    // 4. Transport 생성
    // 서버에서 받아온 producer transport의 params를 이용하여
    // 미디어를 보낼 transport를 생성한다.
    await createProduceTransport();

    // 5. LocalStream 가져오기
    // 해당 내용은 webRTC와 동일함.
    await getLocalStream();

    // 6. 이제 서버에서 받아온다.
    await subscribe();
    await subscribe();
})

async function getRtpCapabilities(){
    console.log("Requesting Rtp Capabilities");
    const data = await socket.request("getRtpCapabilities");
    rtp_capabilities = data.rtpCapabilities;
    console.log("Got Rtp Capabiltites : ",rtp_capabilities);
}

async function createDevice(){
    console.log("Creating Device");
    try{
        device = new mediasoup.Device();
        await device.load({
            routerRtpCapabilities : rtp_capabilities
        })

        console.log("RTP Capabilities Device : ", device.rtpCapabilities);
    }catch (error) {
        console.log(error)
        if(error.name === "UnsupportedError")
            console.warn('browser not supported');
    }
}

async function getTransportData(){
    transport_data = await socket.request('createProducerTransport');
    console.log("Produce Transport data : ",transport_data);
}

async function createProduceTransport(){
    console.log("Creating Produce Transport");

    producer_transport = device.createSendTransport(transport_data);
    producer_transport.on('connect',async({ dtlsParameters },callback, errback) => {
        console.log("Producer Transport Connecting...");
        socket.request('connectProducerTransport', { dtlsParameters })
        .then(callback)
        .catch(errback)

        console.log("Producer Transport Connected");
    });

    producer_transport.on('produce',async({ kind, rtpParameters }, callback, errback) => {
        console.log("Producer Transport Producing...");
        try{
            const { id } = await socket.request('produce', {
                transportId : producer_transport.id,
                kind,
                rtpParameters
            });
            callback({ id });
        }catch(err) {
            errback(err);
        }
        console.log("Producer Transport Produced...");
    })

    producer_transport.on("connectionstatechange", (state) => {
        console.log("Produce Transport State Changed to : ",state);
        if(state == "connected"){
            let local_video = document.getElementById('localVideo');
            local_video.srcObject = local_stream;
        }
    })

    console.log("Produce Transport Created");
}

async function getLocalStream(){
    local_stream = await getUserMedia();
    // video track
    const track = local_stream.getVideoTracks()[0];
    const params = {track};

    console.log("Producing tracks");
    console.log("params",params);
    producer = await producer_transport.produce(params);
    console.log("Track Produced");
}

async function getUserMedia(){
    console.log("Getting user media");
    const stream = navigator.mediaDevices.getUserMedia({video: true});
    return stream;
}

async function subscribe(){
    const data = await socket.request("createConsumerTransport",{
        forceTcp: false,
    });
    if (data.error) {
        console.error(data.error);
        return;
    }

    const consumer_transport = await device.createRecvTransport(data);
    console.log("Consumer Transport Id : ",consumer_transport.id)

    consumer_transport.on('connect', ({ dtlsParameters },callback, errback) => {
        socket.request("connectConsumerTransport", {
            transportId : consumer_transport.id,
            dtlsParameters
        }).then(callback)
        .catch(errback);
    });

    consumer_transport.on('connectionstatechange',async (state) => {
        console.log("Consumer Transport Changed To State : ",state);
        if(state == "connected") {
            let remote_video = document.getElementById("remoteVideo1");
            if(remote_video.srcObject == null){
                remote_video.srcObject = await remote_stream;
                remote_stream_list.push(remote_stream);
            }else{
                remote_video = document.getElementById('remoteVideo2');
                remote_video.srcObject = await remote_stream;
                remote_stream_list.push(remote_stream);
            }
            
            let consumer_id;
            console.log(consumer_transport.id);
            for(let i = 0; i < consumer_list.length; i++){
                if(consumer_list[i][0] == consumer_transport.id){
                    consumer_id = consumer_list[i][1];
                    break;
                }
            }
            await socket.request('resume',{ consumer_id });
        }
    })

    let remote_stream = await consume(consumer_transport);
}

async function consume(consumer_transport){
    const { rtpCapabilities } = device;
    const data = await socket.request('consume', { id : consumer_transport.id ,rtpCapabilities });

    console.log("consume data : ",data);

    const {
        producerId,
        id,
        kind,
        rtpParameters,
    } = data;

    let codecOptions = {};
    const consumer = await consumer_transport.consume({
        id,
        producerId,
        kind,
        rtpParameters,
        codecOptions,
    });
    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    consumer_list.push([consumer_transport.id, consumer.id])
    return stream;
}
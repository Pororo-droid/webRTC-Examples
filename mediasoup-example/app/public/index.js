const io = require('socket.io-client')
const mediasoupClient = require('mediasoup-client')

const socket = io("/mediasoup")

let local_video = document.getElementById('localVideo');

let rtp_capabilities;
let device;
let producer_transport;
let producer;

//media devices constraints
let constraints = {
    audio: false,
    video: true,
}

// mediasoup params
let params = {
    encodings: [
      {
        rid: 'r0',
        maxBitrate: 100000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r1',
        maxBitrate: 300000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r2',
        maxBitrate: 900000,
        scalabilityMode: 'S1T3',
      },
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000
    }
}

//handle media streams
function handleStream(stream){
    local_video.srcObject = stream;
    const track = stream.getVideoTracks()[0];
    params = {
        track,
        ...params
    }
}

// 1. 카메라, 오디오 정보 가져오기
function getLocalStream(){
    navigator.mediaDevices.getUserMedia(constraints).then(handleStream);
}

// 3. Create Device
const createDevice = async () => {
    try {
      device = new mediasoupClient.Device()
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

// 2. 라우터 RTP Capabilites 가져오기
function getRtpCapabilities(){
    socket.emit("getRtpCapabilities", (data) => {
        rtp_capabilities = data.rtp_capabilities;
        console.log("RTP Capabilities : ", rtp_capabilities);
        createDevice();
    })
}

//4. Sender Transport
function createSendTransport() {
    socket.emit("createWebRtcTransport",{sender:true},({params}) => {
        if(params.error){
            console.log(params.error)
            return;
        }

        console.log(params);
        // device.createSendTransport
        // 
        // Creates a new WebRTC transport to send media. 
        // The transport must be previously created in the mediasoup router
        // via router.createWebRtcTransport().
        producer_transport = device.createSendTransport(params)

        // transport.on("connect")
        // 
        // Emitted when the transport is about to establish the ICE+DTLS connection 
        // and needs to exchange information with the associated server side transport.
        producer_transport.on('connect', async({ dtlsParameters }, callback, errback) => {
            try{
                await socket.emit("transport-connect",{ dtlsParameters })
                callback();
            }catch(error){
                errback(error);
            }
        })

        // transport.on(“produce”, fn(parameters, callback({ id }), errback(error))
        // 
        // Emitted when the transport needs to transmit information 
        // about a new producer to the associated server side transport. 
        // This event occurs before the produce() method completes.
        producer_transport.on("produce", async(parameters, callback, errback) => {
            try{
                await socket.emit("transport-produce",{
                    kind: parameters.kind,
                    rtcParameters: parameters.rtcParameters,
                    appData: parameters.appData,
                }, ({id}) => {
                    callback({id})
                })
            }catch(error){
                errback(error);
            } 
        })
    })
}

function connectSendTransport() {
    producer = producer_transport.produce(params);
    producer.on('trackended', () => {
        console.log('track ended')
      })
    
      producer.on('transportclose', () => {
        console.log('transport ended')
      })
}

getLocalStream();
getRtpCapabilities();
// createDevice();
createSendTransport();
// connectSendTransport();

socket.on('connection-success',({socketId}) => {
    console.log(socketId);
})

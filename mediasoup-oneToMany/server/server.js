var mediasoup = require('mediasoup');
var express = require('express');
var socket = require('socket.io');

const app = express();
const PORT = 3000;
let server = app.listen(PORT);

let worker;
let router;
let producer_transport;
let producer;

let consumer_transport_list = [];
let consumer_list = [];
// let consumer_transport;
// let consumer;

(async() => {
    try{
        await runMediasoupWorker();
    }catch(err){
        console.log(err);
    }
})();

// allow cors
const io = socket(server, {
    cors: {
        origin:'*',
        methods: ["GET","POST"]
    }
});

io.on("connection",(socket) => {
    console.log("socket ID : ",socket.id);
    socket.emit("connection-success",{
        socketId: socket.id
    })

    socket.on("getRtpCapabilities",async(data,callback) => {
        console.log("Sending Rtp Capabilities...")
        // callback({rtpCapabilities : router.rtpCapabilities})
        callback({rtpCapabilities : router.rtpCapabilities})
        console.log("Rtp Capabilties Sended");
    })

    socket.on("createProducerTransport",async(data,callback) =>{
        try{
            console.log("Creating Producer Transport...");
            const { transport, params } = await createWebRtcTransport();
            producer_transport = transport;
            console.log("Producer Transport ID : ",producer_transport.id)
            callback(params);

            console.log("Succefully created Producer Transport");
        } catch(err){
            console.log(err);
            callback({error : err.message })
        }
    })

    socket.on("connectProducerTransport",async(data, callback) => {
        console.log("Connecting Producer Transport...");
        await producer_transport.connect({ dtlsParameters:data.dtlsParameters });
        callback();
    })

    socket.on("produce", async(data,callback) => {
        const { kind, rtpParameters } = data;
        producer = await producer_transport.produce({ kind, rtpParameters });
        callback({ id : producer.id });
    })

    socket.on("createConsumerTransport",async(data,callback) => {
        try{
            const { transport, params } = await createWebRtcTransport();
            let consumer_transport = transport;

            console.log("Consumer Transport ID : ",consumer_transport.id)
            console.log("Consumer Transport : ",consumer_transport)
            consumer_transport_list.push(consumer_transport);
            callback(params);
        } catch(err) {
            console.error(err);
            callback({ error : err.message })
        }
    });

    socket.on("connectConsumerTransport",async(data, callback) => {
        console.log("Connecting Consumer Transport ID : ",data.transportId);
        // find right consumer transport
        let consumer_transport
        for(let i = 0; i < consumer_transport_list.length; i++){
            if(consumer_transport_list[i].id == data.transportId){
                consumer_transport = consumer_transport_list[i];
                break;
            }
        }
        
        await consumer_transport.connect({ dtlsParameters: data.dtlsParameters });
        callback();
    })

    socket.on("resume", async(data, callback) => {
        id = data.consumer_id;
        let consumer;
        for(let i = 0; i < consumer_list.length; i++){
            if(consumer_list[i].id == id){
                consumer = consumer_list[i];
                break;
            }
        }
        await consumer.resume();
        callback();
    })

    socket.on("consume", async(data,callback) =>{
        console.log(data);
        const result = await createConsumer(producer, data.rtpCapabilities, data.id)
        // console.log("consume result : ",result);
        callback(result);
    })
})

async function runMediasoupWorker(){
    console.log("Creating Mediasoup worker & router...");
    worker = await mediasoup.createWorker({
        logLevel: 'warn',
        logTags: [
            'info',
            'ice',
            'dtls',
            'rtp',
            'srtp',
            'rtcp'
          ],
        rtcMinPort: 2000,
        rtcMaxPort: 2020,
    });

    worker.on('died', () => {
        console.error('mediasoup worker died, exiting in 2 seconds... [pid:%d]', worker.pid);
        setTimeout(() => process.exit(1), 2000);
    });

    const mediaCodecs = [
        {
          kind: 'audio',
          mimeType: 'audio/opus',
          clockRate: 48000,
          channels: 2
        },
        {
          kind: 'video',
          mimeType: 'video/VP8',
          clockRate: 90000,
          parameters:
            {
              'x-google-start-bitrate': 1000
            }
        },
    ]
    router = await worker.createRouter({ mediaCodecs });

    console.log('Medisoup worker & router created');
    console.log("worker PID : ",worker.pid);
    console.log("router ID : ",router.id);
}

async function createWebRtcTransport() {
    try{
        const webRtcTransport_options = {
            listenIps: [
              {
                ip: '0.0.0.0', // replace with relevant IP address
                announcedIp: '127.0.0.1',
              }
            ],
            enableUdp: true,
            enableTcp: true,
            preferUdp: true,
        }

        let transport = await router.createWebRtcTransport(webRtcTransport_options);

        transport.on('dtlsstatechange', dtlsState => {
            if (dtlsState === 'closed') {
              transport.close()
            }
        })

        transport.on('close', () => {
            console.log('transport closed')
        })

        return {
            transport,
            params: {
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
              }
        }

    }catch(error){

    }
}

async function createConsumer(producer, rtpCapabilities, consumer_transport_id){
    if (!router.canConsume(
        {
          producerId: producer.id,
          rtpCapabilities,
        })
    ) {
        console.error('can not consume');
        return;
    }

    let consumer_transport;
    
    for(let i = 0; i < consumer_transport_list.length; i++){
        console.log(consumer_transport_list[i].id)
        if(consumer_transport_list[i].id == consumer_transport_id){
            consumer_transport = consumer_transport_list[i];
            break;
        }
    }

    let consumer;
    try{
        consumer = await consumer_transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: producer.kind === 'video',
        });
    }catch(error) {
        console.error('consume failed',error);
        return;
    }

    if(consumer.type === 'simulcast'){
        await consumer.setPrefferedLayers({ spatialLayer : 2, temporalLayer: 2 })
    }

    consumer_list.push(consumer);
    return {
        producerId: producer.id,
        id: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused
    };

}
var mediasoup = require('mediasoup');
var express = require('express');
var socket = require('socket.io');

const app = express();
const PORT = 3000;
let server = app.listen(PORT);

let worker;
let router;

let producer_dict = {};
let producer_transport_dict = {};

let consumer_dict = {};
let consumer_transport_dict = {};

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

    socket.on("broadcastProducer",() => {
        socket.broadcast.emit("createConsumer",{producerId : producer_dict[socket.id].id})
    })

    socket.on("getRtpCapabilities",async(data,callback) => {
        console.log("Sending Rtp Capabilities...")
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

            producer_transport_dict[socket.id] = transport;
            console.log("Succefully created Producer Transport");
        } catch(err){
            console.log(err);
            callback({error : err.message })
        }
    })

    socket.on("connectProducerTransport",async(data, callback) => {
        console.log("Connecting Producer Transport...");
        const producer_transport = producer_transport_dict[socket.id]
        await producer_transport.connect({ dtlsParameters:data.dtlsParameters });
        callback();
    })

    socket.on("produce", async(data,callback) => {
        const { kind, rtpParameters } = data;
        producer = await producer_transport.produce({ kind, rtpParameters });
        producer_dict[socket.id] = producer
        console.log("PRODUCER : ")
        console.log(producer.id);
        callback({ id : producer.id });
    })

    socket.on("createConsumerTransport",async(data,callback)=>{
        try{
            const { transport, params } = await createWebRtcTransport();
            console.log("NEW CONSUMER TRANSPORT");
            console.log(transport.id);
            
            consumer_transport_dict[socket.id].push(transport);
            callback(params);
        }catch(err){
            console.error(err);
            callback({ error : err})
        }
    })

    socket.on("createConsumerTransportList",async(data,callback) => {
        result = []
        transport_list = []
        try{
            for(var key in producer_dict){
                const { transport,params } = await createWebRtcTransport();
                console.log("New Consumer Transport ID : ",transport.id);
                
                result.push([params, producer_dict[key].id])
                transport_list.push(transport);
            }
            consumer_transport_dict[socket.id] = transport_list;
            callback(result);
        }catch(err){
            console.log(err);
            callback({ error : err.message });
        }
    })

    socket.on("connectConsumerTransportList",async(data, callback) => {
        console.log("Connecting Consumer Transport ID : ",data.transportId);
        
        let consumer_transport;
        for(let i = 0; i < consumer_transport_dict[socket.id].length; i++){
            if(consumer_transport_dict[socket.id][i].id == data.transportId){
                consumer_transport = consumer_transport_dict[socket.id][i];
                break;
            }
        }
        // console.log(consumer_transport);
        await consumer_transport.connect({ dtlsParameters: data.dtlsParameters });
        callback();
    })

    socket.on("resume", async(data, callback) => {
        id = data.consumer_id;
        let consumer;
        console.log("data : ",id);
        for(let i = 0; i < consumer_dict[socket.id].length; i++){
            console.log("consumer_dict id : ",consumer_dict[socket.id][i].id);
            if(consumer_dict[socket.id][i].id == id){
                consumer = consumer_dict[socket.id][i];
                break;
            }
        }
        console.log("RESUMING CONSUMER : ");
        console.log(consumer.id);
        await consumer.resume();
        callback();
    })

    socket.on("consume", async(data,callback) =>{
        console.log("============ CONSUME ============");
        console.log(data.producerId);
        const result = await createConsumer(data.rtpCapabilities, data.id, data.producerId, socket.id)
        callback(result);
    })
})


async function createConsumer(rtpCapabilities, consumer_transport_id, producer_id, socket_id){
    console.log("===================== CREATING CONSUMER =====================");
    console.log("GOT PRODUCER ID : ",producer_id)

    if (!router.canConsume(
        {
          producerId: producer_id,
          rtpCapabilities,
        })
    ) {
        console.error('can not consume');
        return;
    }

    let consumer_transport;

    console.log("CONSUMER_TRANSPORT_ID : ",consumer_transport_id);
    for(let i = 0; i < consumer_transport_dict[socket_id].length; i++){
        if(consumer_transport_dict[socket_id][i].id == consumer_transport_id){
            consumer_transport = consumer_transport_dict[socket_id][i];
            break;
        }
    }

    console.log("CONSUMER TRANSPORT FOUND(?)");
    console.log(consumer_transport != null);

    let created_consumer;
    try{
        created_consumer = await consumer_transport.consume({
            producerId: producer.id,
            rtpCapabilities,
            paused: producer.kind === 'video',
        });

        created_consumer.on("transportclose",() =>{
            console.log("Consumer Closed ID : ",created_consumer.id);
        })
    }catch(error) {
        console.error('consume failed',error);
        return;
    }

    if(created_consumer.type === 'simulcast'){
        await created_consumer.setPrefferedLayers({ spatialLayer : 2, temporalLayer: 2 })
    }
    try{
        consumer_dict[socket_id].push(created_consumer);
    }catch(error){
        consumer_dict[socket_id] = [created_consumer];
    }
    return {
        producerId: producer_id,
        id: created_consumer.id,
        kind: created_consumer.kind,
        rtpParameters: created_consumer.rtpParameters,
        type: created_consumer.type,
        producerPaused: created_consumer.producerPaused
    };
}

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
const mediasoup = require('mediasoup');
const fs = require('fs');
const https = require('https');
const express = require('express');
const socket = require('socket.io');

const app = express();

let worker;
let router;
let producer_transport;
let consumer_transport;

// 서버시작하자 마자 Router & Worker 생성.
(async() => {
    try{
        await runMediasoupWorker();
    }catch (err) {
        console.error(err);
    }
})();

let server = app.listen(3000);

//allow cors
const io = socket(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
});

// webRTC Transport 생성
async function createWebRtcTransport() {
    try {
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
    
        let transport = await router.createWebRtcTransport(webRtcTransport_options)
        console.log(`transport id: ${transport.id}`)
    
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
    
    } catch (error) {
        console.log(error)
        callback({
          params: {
            error: error
          }
        })
    }

}

io.on("connection", function(socket){
    // 연결을 시작하면 socket이 제대로 연결되었는지 socketid 출력
    console.log("socket ID : ",socket.id);
    socket.emit("connection-success",{
        socketId: socket.id
    });

    // 라우터의 rtp Capabilties 전송
    socket.on("getRtpCapabilities",async(data,callback) => {
      console.log("Sending Rtp Capabilities...")
      // callback({rtpCapabilities : router.rtpCapabilities})
      callback({rtpCapabilities : router.rtpCapabilities})
      console.log("Rtp Capabilties Sended");
    })

    // Produce Transport 생성
    socket.on("createProducerTransport",async(data,callback) => {
        try{
            const { transport, params } = await createWebRtcTransport();
            producer_transport = transport;
            console.log("producer transport : ",producer_transport)
            callback(params);
        } catch(err) {
            console.log(err);
            callback({ error : err.message })
        }
    })

    // Producer Transport 연결
    socket.on("connectProducerTransport",async(data,callback) => {
        await producer_transport.connect({ dtlsParameters:data.dtlsParameters });
        callback();
    })

    // producer 생성
    // transport.producer => 
    // Instructs the router to receive audio or video RTP
    socket.on("produce",async(data,callback) => {
        const {kind, rtpParameters} = data;
        producer = await producer_transport.produce({ kind, rtpParameters });
        callback({ id: producer.id });
    })

    // consumer transport 생성
    socket.on('createConsumerTransport', async (data, callback) => {
        try {
          const { transport, params } = await createWebRtcTransport();
          consumer_transport = transport;
          callback(params);
        } catch (err) {
          console.error(err);
          callback({ error: err.message });
        }
    });

    // transport.connect
    // Provides the transport with the remote endpoint's 
    // transport parameters
    socket.on('connectConsumerTransport', async (data, callback) => {
        await consumer_transport.connect({ dtlsParameters: data.dtlsParameters });
        callback();
    });

    socket.on('resume', async (data, callback) => {
        await consumer.resume();
        callback();
    });

    socket.on('consume', async (data, callback) => {
        callback(await createConsumer(producer, data.rtpCapabilities));
    });
  
})

// Worker & Router 생성
async function runMediasoupWorker() {
    console.log("Mediasoup worker & router creating ....");
    worker = await mediasoup.createWorker({
        logLevel: 'warn',
        logTags: [
            'info',
            'ice',
            'dtls',
            'rtp',
            'srtp',
            'rtcp',
            // 'rtx',
            // 'bwe',
            // 'score',
            // 'simulcast',
            // 'svc'
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

    console.log("Mediasoup worker & router created");
    console.log("worker PID : ",worker.pid);
    console.log("router ID : ",router.id);
}

// consumer 생성
// transport.consumer =>
// Instructs the router to send audio or video RTP
// (or SRTP depending on the transport class)
async function createConsumer(producer, rtpCapabilities) {
    if (!router.canConsume(
      {
        producerId: producer.id,
        rtpCapabilities,
      })
    ) {
      console.error('can not consume');
      return;
    }
    try {
      consumer = await consumer_transport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: producer.kind === 'video',
      });
    } catch (error) {
      console.error('consume failed', error);
      return;
    }
  
    if (consumer.type === 'simulcast') {
      await consumer.setPreferredLayers({ spatialLayer: 2, temporalLayer: 2 });
    }
  
    return {
      producerId: producer.id,
      id: consumer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      type: consumer.type,
      producerPaused: consumer.producerPaused
    };
  }  
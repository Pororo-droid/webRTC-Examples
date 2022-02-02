var express = require('express');
var socket = require('socket.io')
var https = require('httpolyglot')
var fs = require('fs');
var path = require('path')
const app = express();
var mediasoup = require('mediasoup');

app.get('/', (req,res)=>{
    res.send('Test');
})

app.use('/sfu', express.static(path.join(__dirname, 'public')))

//https 사용가능하도록 만들기
const options = {
    key: fs.readFileSync('./etc/ssl/key.pem', 'utf-8'),
    cert: fs.readFileSync('./etc/ssl/cert.pem', 'utf-8')
}

// https server 시작
const httpsServer = https.createServer(options, app)
httpsServer.listen(3000, () => {
  console.log('listening on port: ' + 3000)
})

//socket 설정
const io = new socket.Server(httpsServer);
const peers = io.of('/mediasoup');

//mediasoup 변수들
let worker;
let router;
let producerTransport;
let consumerTransport;

//worker 생성 (기본)
const createWorker = async() => {
    worker = await mediasoup.createWorker({
        //settings
        rtcMinPort : 2000,
        rtcMaxPort : 2020
    });
    console.log(worker.pid);

    worker.on('died', error => {
        console.log("worker died");
    });

    return worker
}
worker = createWorker();

//router 생성시 media codes
const media_codecs = [
    {
      kind: 'audio',
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
    },
    {
      kind: 'video',
      mimeType: 'video/VP8',
      clockRate: 90000,
      parameters: {
        'x-google-start-bitrate': 1000,
      },
    },
]

peers.on('connection', async socket => {
    // 연결을 시작하면 socket이 제대로 연결되었는지 socketid 출력
    console.log("socket id : ",socket.id);
    socket.emit("connection-success",{
        socketId: socket.id
    });
    router = await worker.createRouter({media_codecs});
    // 라우터가 제대로 생성이 되었는지 확인
    console.log('router ID : ',router.id)

    socket.on('getRtpCapabilities',(callback) => {
        const rtp_capabilities = router.rtpCapabilities;
        console.log("RTP Capabilities : ",rtp_capabilities);

        callback({rtp_capabilities});
    })

    socket.on("createWebRtcTransport", async({sender}, callback) =>{
        if(sender)
            producerTransport = await createWebRtcTransport(callback)
        else
            consumerTransport = await createWebRtcTransport(callback)
    })
})

const createWebRtcTransport = async (callback) => {
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
  
      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters,
        }
      })
  
      return transport
  
    } catch (error) {
      console.log(error)
      callback({
        params: {
          error: error
        }
      })
    }
}
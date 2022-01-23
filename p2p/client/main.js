//Allow cors
var socket = io.connect(`http://localhost:3000`,{
    cors: { origin: '*' }
  });
const local_video = document.getElementById('localVideo');
const remote_video = document.getElementById('remoteVideo');

let local_stream;
let pc;

// STUN / TURN  Servers
const servers = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
}

const mediaStreamConstraints = {
    video : true,
};


function gotLocalMediaStream(mediaStream) {
    local_stream = mediaStream;
    local_video.srcObject = mediaStream;
}
function connect(){
    pc = new RTCPeerConnection(servers);
    pc.onicecandidate = event => onIceCandidate(event);
    pc.ontrack = gotRemoteStream;
    local_stream.getTracks().forEach(track => pc.addTrack(track, local_stream));

    console.log("connect");
    socket.emit("onConnect");
}

function onIceCandidate(event){
    console.log("onIceCandidate",event);
    if (!event || !event.candidate) return;
    socket.emit("iceCandidate", event.candidate);
}

function gotRemoteStream(stream){
    remote_video.srcObject = stream.streams[0];
}

socket.on("handleNegotiationNeededEvent",function(){
    console.log("hangleNegotiationNeededEvent");
    pc.createOffer().then(description => {
        pc.setLocalDescription(description);
        socket.emit("videoOffer",description);
    })
})

socket.on("handleVideoOfferMsg",function(description){
    console.log("handleVideoOfferMsg");
    pc.setRemoteDescription(description);
    pc.createAnswer().then(answer => {
        pc.setLocalDescription(answer);
        socket.emit("videoAnswer",answer);
    })
})

socket.on("handleVideoAnswerMsg",function(description){
    console.log("handleVideoAnswerMsg");
    pc.setRemoteDescription(description);
})

socket.on("addiceCandidate",function(event){
    console.log("addIceCandidate",event);
    pc.addIceCandidate(new RTCIceCandidate(event));
})

navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
.then(gotLocalMediaStream).then(connect);
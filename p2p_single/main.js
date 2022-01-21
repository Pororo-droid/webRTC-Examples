const constraints = {
    video: true
}

const servers = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
}

const local_video = document.getElementById('localVideo');
const remote_video = document.getElementById('remoteVideo');

let local_stream;
let local_peer_connection;
let remote_peer_connection;

const offer_options = {
    offerToReceiveVideo: 1
}

function gotStream(stream){
    local_video.srcObject = stream;
    local_stream = stream;
}

function gotRemoteStream(stream){
    remote_video.srcObject = stream.streams[0];
}

function connect(){
    local_peer_connection = new RTCPeerConnection(servers);
    local_peer_connection.onicecandidate = event => onIceCandidate(local_peer_connection, event);

    remote_peer_connection = new RTCPeerConnection(servers);
    remote_peer_connection.onicecandidate = event => onIceCandidate(remote_peer_connection,event);
    remote_peer_connection.ontrack = gotRemoteStream;

    local_stream.getTracks().forEach(track => local_peer_connection.addTrack(track, local_stream));
    local_peer_connection.createOffer(offer_options)
    .then(offerResponse);
}

function init(){
    navigator.mediaDevices.getUserMedia(constraints)
    .then(gotStream)
    .then(connect)
}
function offerResponse(description) {
    local_peer_connection.setLocalDescription(description);
    remote_peer_connection.setRemoteDescription(description);
    remote_peer_connection.createAnswer().then(answerResponse);
  }

function answerResponse(description) {
    remote_peer_connection.setLocalDescription(description);
    local_peer_connection.setRemoteDescription(description);
}

function iceStateCallback1() {
    let iceState;
    if (local_peer_connection) {
        iceState = local_peer_connection.iceConnectionState;
    }
}
function onIceCandidate(pc, event) {
getOtherPc(pc)
    .addIceCandidate(event.candidate)

}

function getOtherPc(pc) {
    return (pc === local_peer_connection) ? remote_peer_connection : local_peer_connection;
  }
  

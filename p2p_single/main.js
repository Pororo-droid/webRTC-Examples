//현재는 callFunction() 콘솔로 콜해야 실행이됨.
//AWAIT으로 변경해봐

// STUN / TURN  Servers
const servers = {
    'iceServers': [{
        'urls': 'stun:stun.l.google.com:19302'
    }]
}

const constraints = {
    video: true
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let localStream;
let localPeerConnection = new RTCPeerConnection(servers);
let remotePeerConnection = new RTCPeerConnection(servers);

// remotePeerConnection.addEventListener('track', async(event)=>{
//     console.log('remote ',event)
//     let remoteStream = event;
//     remoteVideo.srcObejct = remoteStream;
// })
remotePeerConnection.ontrack = gotRemoteStream;

function gotRemoteStream(e) {
    console.log('gotRemoteStream',e);
    remoteVideo.srcObject = e.streams[0];
}

function getStream(){
    navigator.mediaDevices.getUserMedia(constraints)
    .then(getLocalStream);
}

function getLocalStream(stream){
    console.log('Local stream',stream);
    localVideo.srcObject = stream;
    localStream = stream;
}

function callFunction(){
    // const videoTracks = localStream.getVideoTracks();
    // const audioTracks = localStream.getAudioTracks();
    // console.log(videoTracks);
    const offer = localPeerConnection.createOffer().then(onCreateOfferSuccess);
    console.log('offer',offer);

    localStream.getTracks().forEach(track => {
        console.log('got local track',track);
        localPeerConnection.addTrack(track, localStream);
    });
}

async function onCreateOfferSuccess(desc){
    await localPeerConnection.setLocalDescription(desc);
    await remotePeerConnection.setRemoteDescription(desc);
    const answer = await remotePeerConnection.createAnswer();
    await onCreateAnswerSuccess(answer);
}

async function onCreateAnswerSuccess(desc){
    await remotePeerConnection.setLocalDescription(desc);
    await localPeerConnection.setRemoteDescription(desc);
}

getStream();
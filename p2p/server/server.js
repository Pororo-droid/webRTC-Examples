const express = require('express');
const socket = require('socket.io');
const app = express();

let connection = {}
let server = app.listen(3000);
//allow cors  
const io = socket(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

function getOtherSockerID(id){
    if(id === connection['callee']) return connection['caller'];
    return connection['callee'];
}

io.on("connection", function(socket){
    // console.log(socket.id);
    // console.log(connection['callee']);
    if(connection['callee'] === undefined){
        console.log('callee',socket.id);
        connection['callee'] = socket.id;
    }else if(connection['caller'] === undefined){
        console.log('caller',socket.id);
        connection['caller'] = socket.id
        // socket.to(socket.id).emit("handleNegotiationNeededEvent")
    }
    socket.on("onConnect",function(){
        // socket.emit("addCandidate",candidate);
        // console.log("Connect function",socket.id);
        if(socket.id == connection['callee']){
            console.log('callee');
        }else if(socket.id == connection['caller']){
            console.log('caller',socket.id);
            io.to(socket.id).emit("handleNegotiationNeededEvent",{})
        }
    })

    socket.on("iceCandidate",function(event){
        console.log(socket.id,getOtherSockerID(socket.id));
        io.to(getOtherSockerID(socket.id)).emit("addiceCandidate",event);
    })

    socket.on("videoOffer",function(description){
        io.to(getOtherSockerID(socket.id)).emit("handleVideoOfferMsg",description);
    })

    socket.on("videoAnswer",function(description){
        io.to(getOtherSockerID(socket.id)).emit("handleVideoAnswerMsg",description);
    })
    
})
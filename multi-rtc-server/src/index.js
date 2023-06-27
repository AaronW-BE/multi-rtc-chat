let http = require('http');
let express = require('express')
const {Server} = require('socket.io');
const nanoid = require('nanoid')

let app = express();

let httpServer = http.createServer(app);
httpServer.listen(8080);

const socketIO = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:3000', 'http://127.0.0.1:3000', 'https://localhost:3000', 'https://127.0.0.1:3000', 'https://192.168.2.199:3000'],
    credentials: true
  }
})


let roomRepo = {};

socketIO.sockets.on('connection', socket => {

  console.log('a connection created')

  socket.on('message', ({roomId, data}) => {
    console.log('message , room: ' + roomId + ', data , type:' + data.type);
  })

  socket.on('create-room', () => {
    let roomId = nanoid();

    socket.join(roomId);

    roomRepo[roomId] = {
      createAt: Date.now(),
      creator: socket.id,
      roomId,
      members: [socket]
    }

    console.warn('user create a room, id: %s', roomId)

    socket.emit('create-room-resp', {
      roomId
    })
  })

  socket.on('join', ({roomId}) => {
    console.log('client join room %s', roomId)
    if (!roomId) return;

    if (!roomRepo[roomId]) {
      socket.emit('join-resp', {
        success: false,
        msg: 'not found a room id ' + roomId
      })
      return;
    }

    if (roomRepo[roomId].members.length < 5) {
      socket.join(roomId);

      roomRepo[roomId].members.push(socket);
      socket.emit('joined', {
        roomId,
        userCount: roomRepo[roomId].members.length,
        userIds: roomRepo[roomId].members.map(m => m.id)
      })

      // notify others new member joined
      socket.to(roomId).emit('new-member', {
        roomId, userId: socket.id,
        userIds: roomRepo[roomId].members.map(m => m.id)
      })
    } else {
      socket.emit('full', {
        roomId,
        userCount: roomRepo[roomId].members.length
      })
    }
  })

  socket.on('leave', ({roomId}) => {
    console.log('client leave room %s', roomId)
  })

  socket.on('disconnect', () => {
    console.log('disconnected')
  })

  // OFFER SDP
  socket.on('SIGNALING_OFFER', ({sdp, roomId}) => {
    console.warn('SIGNALING_OFFER')
    socket.to(roomId).emit('SIGNALING_OFFER', {
      sdp, roomId,
      from: socket.id
    })
  })

  // ice candidate
  socket.on('SIGNALING_CANDIDATE', ({candidate, roomId}) => {
    console.warn('SIGNALING_CANDIDATE', roomId)
    socket.to(roomId).emit('SIGNALING_CANDIDATE', {
      candidate, roomId,
      from: socket.id
    })
  })

  // answer sdp
  socket.on('SIGNALING_ANSWER', ({sdp, roomId}) => {
    console.warn('SIGNALING_ANSWER', roomId)
    socket.to(roomId).emit('SIGNALING_ANSWER', {
      sdp, roomId,
      from: socket.id
    })
  })
})

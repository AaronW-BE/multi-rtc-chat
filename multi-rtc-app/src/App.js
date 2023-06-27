import { io } from 'socket.io-client';
import { nanoid } from 'nanoid'
import {Component} from "react";

import './App.css';
import {createRef} from "react";

class App extends Component{
  constructor(props) {
    super(props);
    this.state = {
      socket: null,
      socketConnected: false,
      roomId: null,
      currentJoinedRoomId: null,
      roomMembers: []
    }
    this.localVideo = createRef();
    this.remoteVideo = createRef();

    this.peerConnections = {};
    this.localPeerConnection = null;
  }

  componentDidMount() {
    let _socket = io("ws://127.0.0.1:8080/");

    _socket.on('connect', () => {
      this.setState({
        socketConnected: true,
        socket: _socket
      })
      console.log('connected, id: ', _socket.id);
    })

    _socket.on('disconnect', () => {
      this.setState({
        socketConnected: false,
      })
    })

    _socket.on('create-room-resp', ({roomId}) => {
      console.log('create room resp', roomId)
      this.setState({
        currentJoinedRoomId: roomId
      })
    })

    _socket.on('new-member', ({roomId, userIds, userId}) => {
      this.setState({
        roomMembers: userIds
      })
      console.log('new member', userId)
    })

    _socket.on('joined', ({userIds}) => {
      this.setState({
        roomMembers: userIds
      })
      this.getLocalMediaStream();
    })

    _socket.on('full', ({roomId, userCount}) => {
      alert('room full' +  roomId + "-" + userCount)
    })


    _socket.on('SIGNALING_OFFER', async ({sdp, roomId, from}) => {
      console.log('SIGNALING_OFFER', sdp, roomId)
      console.log(`receive remote description`);
      const remoteDescription = new RTCSessionDescription(sdp);


      // let pc = this.createPC(); // 被叫
      let pc = new RTCPeerConnection({
        iceServers: [
          {url: 'stun:stun.ekiga.net'},
        ]
      })

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          console.info('被叫ice candidate 发送')
          this.state.socket.emit('SIGNALING_CANDIDATE', {
            roomId: this.state.roomId,
            candidate: ev.candidate
          })
        }
      }

      pc.ontrack = ev => {
        console.log('被叫获得视频流', ev.streams)
        this.remoteVideo.current.srcObject = ev.streams[0];
      }

      pc.setRemoteDescription(sdp).then(() => {
        console.log('set remote description')
      });

      let answer = await pc.createAnswer()
      await pc.setLocalDescription(answer);

      this.state.socket.emit('SIGNALING_ANSWER', {
        sdp: answer,
        roomId
      })

      this.peerConnections[from] = pc
    })

    _socket.on('SIGNALING_CANDIDATE', ({candidate, roomId, from}) => {
      console.log('SIGNALING_CANDIDATE', candidate, roomId, from)

      if (this.localPeerConnection) {
        console.info('主叫方添加ice')
        this.localPeerConnection.addIceCandidate(candidate).then(() => {
          console.log('added candidate from local')
        });
      }else {
        console.log('from', from)
        console.info('被叫方添加ice')
        this.peerConnections[from] && this.peerConnections[from].addIceCandidate(candidate).then(() => {
          console.log('added candidate')
        });
      }
    })

    _socket.on('SIGNALING_ANSWER', ({sdp, roomId}) => {
      console.log(`receive remote answer from ${roomId}`);
      // const remoteDescription = new RTCSessionDescription(sdp);
      this.localPeerConnection.setRemoteDescription(sdp).then(() => {
        console.log('remote description settled')
      });
    })
    _socket.connect();
  }

  createRoom() {
    console.log('this', this)
    let roomId = nanoid();
    this.state.socket.emit('create-room', {roomId})
  }

  joinRoom() {
    this.setState({
      currentJoinedRoomId: this.state.roomId
    })
    this.state.socket.emit('join', {roomId: this.state.roomId});
  }

  quitRoom() {
    console.warn("quit room")
  }

  onRoomIdInput(e) {
    console.log(e.target.value)
    this.setState({
      roomId: e.target.value
    })
  }

  getLocalMediaStream() {
    navigator.mediaDevices.getUserMedia({audio: false, video: true}).then(mediaStream => {
      if (mediaStream) {
        this.localVideo.current.srcObject = mediaStream;

        this.localPeerConnection = new RTCPeerConnection({
          iceServers: [
            {url: 'stun:stun.ekiga.net'},
          ]
        })
        this.localPeerConnection.onnegotiationneeded = async (ev) => {
          console.info('主叫发送offer')
          const offer = await this.localPeerConnection.createOffer();
          await this.localPeerConnection.setLocalDescription(offer);

          this.state.socket.emit('SIGNALING_OFFER', {
            sdp: this.localPeerConnection.localDescription,
            roomId: this.state.roomId
          })
        }
        this.localPeerConnection.onicecandidate = (ev) => {
          if (ev.candidate) {
            this.state.socket.emit('SIGNALING_CANDIDATE', {
              roomId: this.state.roomId,
              candidate: ev.candidate
            })
          }
        }
        // this.localPeerConnection.onicegatheringstatechange = () => {
        //   console.log(`onicegatheringstatechange, pc.iceGatheringState is ${pc.iceGatheringState}.`);
        // }
        // this.localPeerConnection.oniceconnectionstatechange = () => {
        //   console.log(`oniceconnectionstatechange, pc.iceConnectionState is ${pc.iceConnectionState}.`);
        // }
        // this.localPeerConnection.onsignalingstatechange = () => {
        //   console.log(`onsignalingstatechange, pc.signalingstate is ${pc.signalingState}.`);
        // }
        this.localPeerConnection.ontrack = (ev) => {
          console.log('on track from far', ev.streams)
          this.remoteVideo.current.srcObject = ev.streams[0];
        }

        mediaStream.getTracks().forEach(track => {
          this.localPeerConnection.addTrack(track, mediaStream);
        })
      }
    })
  }
  render() {
    return (
      <div className="App">
        <div>
          {
            this.state.currentJoinedRoomId && <p>Current joined RoomId: {this.state.currentJoinedRoomId}</p>
          }
        </div>
        <div className='room-members'>
          {
            this.state.roomMembers.map(member => (
              <div className='member' key={member}> Member Id:  {member}</div>
            ))
          }
        </div>
        <div>
          <button disabled={!this.state.socketConnected} onClick={this.createRoom.bind(this)}>Create Room</button>
        </div>

        <div>
          <input onChange={this.onRoomIdInput.bind(this)} placeholder="Input Room Id you join to" />
          <button onClick={this.joinRoom.bind(this)}>Join</button>
        </div>

        <div className="video-list">
          <div className='chat-video'>
            <video autoPlay={true} controls={false} ref={this.localVideo} />
          </div>
          <div className='chat-video'>
            <video autoPlay={true} controls={false} ref={this.remoteVideo} />
          </div>
        </div>

        <div>
          <button disabled={!this.state.currentJoinedRoomId} onClick={this.quitRoom.bind(this)}>QUIT ROOM</button>
        </div>
      </div>
    );
  }
}

export default App;

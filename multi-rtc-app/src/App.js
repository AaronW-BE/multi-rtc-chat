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

    let pc;

    _socket.on('SIGNALING_OFFER', ({sdp, roomId}) => {
      console.log('SIGNALING_OFFER', sdp, roomId)
      console.log(`receive remote description`);
      const remoteDescription = new RTCSessionDescription(sdp);
      let peerConnection = this.createPC();
      peerConnection.setRemoteDescription(remoteDescription).then(() => {
        console.log('set remote description')
      });
      pc = peerConnection

    })

    _socket.on('SIGNALING_CANDIDATE', ({candidate, roomId}) => {
      console.log('SIGNALING_CANDIDATE', candidate, roomId)
      pc.addIceCandidate(candidate).then(() => {
        console.log('added candidate')
      })
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

  onRoomIdInput(e) {
    console.log(e.target.value)
    this.setState({
      roomId: e.target.value
    })
  }

  createPC() {
    let pc = new RTCPeerConnection({
    })
    pc.onnegotiationneeded = async () => {
      console.log('onnegotiationneeded')
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      this.state.socket.emit('SIGNALING_OFFER', {
        sdp: pc.localDescription,
        roomId: this.state.roomId
      })
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        console.log('on icecandidate');
        console.log('send icecandidate')


        this.state.socket.emit('SIGNALING_CANDIDATE', {
          roomId: this.state.roomId,
          candidate: ev.candidate
        })
      }
    }
    pc.onicegatheringstatechange = () => {
      console.log(`onicegatheringstatechange, pc.iceGatheringState is ${pc.iceGatheringState}.`);
    }
    pc.oniceconnectionstatechange = () => {
      console.log(`oniceconnectionstatechange, pc.iceConnectionState is ${pc.iceConnectionState}.`);
    }
    pc.onsignalingstatechange = () => {
      console.log(`onsignalingstatechange, pc.signalingstate is ${pc.signalingState}.`);
    }
    pc.ontrack = (ev) => {
      console.log('on track', ev.streams)
      this.remoteVideo.current.srcObject = ev.streams[0];
    }
    return pc
  }

  getLocalMediaStream() {
    navigator.mediaDevices.getUserMedia({audio: false, video: true}).then(mediaStream => {
      if (mediaStream) {
        this.localVideo.current.srcObject = mediaStream;

        let pc = this.createPC();
        mediaStream.getTracks().forEach(track => {
          pc.addTrack(track, mediaStream);
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
            <video autoPlay controls={false} ref={this.localVideo} />
          </div>
          <div className='chat-video'>
            <video autoPlay controls={false} ref={this.remoteVideo} />
          </div>
        </div>
      </div>
    );
  }
}

export default App;

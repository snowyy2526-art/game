import test from 'node:test';
import assert from 'node:assert/strict';
import {createAudio} from '../audio.js';

const param=()=>({value:0,setValueAtTime(value){this.value=value;},exponentialRampToValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;}});
function mockAudio(t,{deferred=false,fail=false}={}) {
  const originalContext=globalThis.AudioContext,originalFetch=globalThis.fetch;
  let context;
  const pending=[];
  class Node {
    constructor(kind){this.kind=kind;this.connections=[];this.gain=param();this.frequency=param();this.Q=param();this.started=false;this.stopped=false;}
    connect(to){this.connections.push(to);return to;}
    disconnect(){this.connections=[];this.disconnected=true;}
    start(){this.started=true;}
    stop(){this.stopped=true;}
    finish(){this.onended?.();}
  }
  globalThis.AudioContext=class {
    constructor(){context=this;this.state='running';this.currentTime=0;this.sampleRate=10;this.destination={};this.sources=[];this.panners=[];this.listener={};for(const prefix of ['position','forward','up'])for(const axis of ['X','Y','Z'])this.listener[prefix+axis]=param();}
    createGain(){return new Node('gain');}
    createDynamicsCompressor(){const n=new Node('compressor');for(const p of ['threshold','knee','ratio','attack','release'])n[p]=param();return n;}
    createBuffer(channels,length,sampleRate){return {duration:length/sampleRate,getChannelData:()=>new Float32Array(length)};}
    createBufferSource(){const n=new Node('source');this.sources.push(n);return n;}
    createBiquadFilter(){return new Node('filter');}
    createOscillator(){return new Node('oscillator');}
    createStereoPanner(){const n=new Node('stereo');n.pan=param();return n;}
    createPanner(){const n=new Node('panner');for(const axis of ['X','Y','Z'])n['position'+axis]=param();this.panners.push(n);return n;}
    decodeAudioData(bytes){if(fail)return Promise.reject(new Error('Bad mp3'));if(deferred)return new Promise(resolve=>pending.push(()=>resolve({duration:bytes.byteLength})));return Promise.resolve({duration:bytes.byteLength});}
    suspend(){this.state='suspended';return Promise.resolve();}
    resume(){this.state='running';return Promise.resolve();}
    close(){this.state='closed';return Promise.resolve();}
  };
  globalThis.fetch=async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
  t.after(()=>{globalThis.AudioContext=originalContext;globalThis.fetch=originalFetch;});
  const clip=name=>({url:`data:audio/mpeg;base64,${name}`,name,duration:4});
  const clips={patrol:[clip('cry'),clip('help')],alert:[clip('run'),clip('flee'),clip('stay-away')],chase:[clip('ferocious-loop')],exhausted:[clip('recovering')],capture:[clip('sorry'),clip('no'),clip('forgive')]};
  const audio=createAudio({wandererClips:clips,randomSource:()=>0});
  t.after(()=>audio.stop());
  return {audio,clips,get context(){return context;},resolveDecodes(){for(const resolve of pending.splice(0))resolve();}};
}

test('Wanderer recordings use moving HRTF world coordinates and the camera listener orientation',async t=>{
  const m=mockAudio(t),{audio}=m;
  assert.equal(audio.debug.contextState,'uninitialized','construction must not autoplay');
  await audio.start();
  assert.equal(audio.debug.decodedClips,10);
  assert.equal(audio.debug.failedClips,0);
  audio.updateListener({x:30,y:1.7,z:-20},{x:1,y:0,z:0});
  audio.setWandererState('alert',{x:33,y:0,z:-21},{clipIndex:2});
  const panner=m.context.panners.at(-1);
  assert.equal(panner.panningModel,'HRTF');
  assert.equal(panner.positionX.value,33);
  assert.equal(panner.positionY.value,1.8);
  assert.equal(panner.positionZ.value,-21);
  assert.equal(m.context.listener.positionX.value,30);
  assert.equal(m.context.listener.forwardX.value,1);
  assert.equal(audio.debug.currentClip,'stay-away');
  audio.setWandererState('alert',{x:35,y:0,z:-19},{clipIndex:0});
  assert.equal(panner.positionX.value,35);
  assert.equal(audio.debug.currentClip,'stay-away','same state must not restart or swap a line each frame');
  const gate=panner.connections[0];
  assert.equal(gate.gain.value,1);
  audio.updateListener({x:60,y:1.7,z:-20},{x:-1,y:0,z:0});
  assert.equal(gate.gain.value,0,'quiet voice must actually fade to silence beyond its radius');
});

test('alert, chase loop, recovery and capture replace each other without overlapping or restarting',async t=>{
  const m=mockAudio(t),{audio}=m;
  await audio.start();
  audio.setWandererState('alert',{x:1,y:0,z:1},{clipIndex:1});
  const alert=m.context.sources.at(-1);
  assert.equal(audio.debug.currentClip,'flee');
  audio.setWandererState('chase',{x:2,y:0,z:2});
  const chase=m.context.sources.at(-1);
  assert.ok(alert.stopped&&alert.disconnected);
  assert.equal(chase.loop,true);
  const sourceCount=m.context.sources.length;
  for(let i=0;i<20;i++)audio.setWandererState('chase',{x:2+i*.1,y:0,z:2});
  assert.equal(m.context.sources.length,sourceCount);
  audio.setWandererState('exhausted',{x:4,y:0,z:2});
  assert.ok(chase.stopped&&chase.disconnected);
  assert.equal(audio.debug.currentClip,'recovering');
  assert.equal(audio.debug.looping,false);
  m.context.sources.at(-1).finish();
  audio.setWandererState('exhausted',{x:4,y:0,z:2});
  assert.equal(audio.debug.playing,false,'a finished recovery line must not repeat while still exhausted');
  audio.setWandererState('capture',{x:4,y:0,z:2},{clipIndex:2});
  assert.equal(audio.debug.currentClip,'forgive');
  audio.setWandererState('inactive');
  assert.equal(audio.debug.playing,false);
  assert.equal(audio.debug.currentClip,null);
});

test('patrol plays spaced varied lines only nearby, and pause preserves an in-progress loop',async t=>{
  const m=mockAudio(t),{audio}=m;
  await audio.start();
  audio.setWandererState('patrol',{x:40,y:0,z:0});
  m.context.currentTime=2;
  audio.update();
  assert.equal(audio.debug.playing,false,'faraway patrol should not waste a voice cue');
  audio.updateListener({x:38,y:1.7,z:0},{x:1,y:0,z:0});
  audio.setWandererState('patrol',{x:40,y:0,z:0});
  assert.equal(audio.debug.currentClip,'cry');
  m.context.sources.at(-1).finish();
  audio.update();
  assert.equal(audio.debug.playing,false,'patrol silence between utterances is intentional');
  m.context.currentTime=8;
  audio.update();
  assert.equal(audio.debug.currentClip,'help','avoid immediately repeating the same patrol clip');
  audio.setWandererState('chase',{x:40,y:0,z:0});
  const source=m.context.sources.at(-1),count=m.context.sources.length;
  audio.setPaused(true);
  await Promise.resolve();
  assert.equal(audio.debug.contextState,'suspended');
  assert.equal(audio.debug.paused,true);
  assert.equal(source.stopped,false);
  audio.setPaused(false);
  await Promise.resolve();
  assert.equal(audio.debug.contextState,'running');
  assert.equal(m.context.sources.length,count,'resume must continue the existing loop');
  audio.setMuted(true);
  assert.equal(audio.debug.muted,true);
});

test('late MP3 decodes cannot resurrect canceled voices and bad audio never blocks play',async t=>{
  const m=mockAudio(t,{deferred:true}),{audio}=m;
  const loading=audio.start();
  audio.setWandererState('alert',{x:1,y:0,z:0});
  await new Promise(resolve=>setImmediate(resolve));
  audio.setWandererState('inactive');
  m.resolveDecodes();
  await loading;
  assert.equal(audio.debug.playing,false);
  assert.equal(m.context.panners.length,0);
  audio.setWandererState('chase',{x:1,y:0,z:0});
  assert.equal(audio.debug.playing,true);
  audio.stop();
  assert.equal(audio.debug.contextState,'uninitialized');
  assert.equal(audio.debug.decodedClips,0);
  assert.equal(audio.debug.currentMode,'inactive');
});

test('corrupt recordings are reported quietly without unhandled rejections',async t=>{
  const {audio}=mockAudio(t,{fail:true});
  await audio.start();
  assert.equal(audio.debug.decodedClips,0);
  assert.equal(audio.debug.failedClips,10);
  audio.setWandererState('alert',{x:1,y:0,z:0});
  assert.equal(audio.debug.playing,false);
  audio.update({inside:true,fire:50});
});

import {RECORDINGS} from '../assets/gemini-catalog.mjs?v=20261023-gemini1';
let dialog,player,originalButton,selectedButton,bypass=false;
function openRecording(button,track){
 document.dispatchEvent(new CustomEvent("recording-preview"));
 if(!dialog){
  dialog=document.createElement('dialog');dialog.className='recording-dialog';dialog.setAttribute('aria-labelledby','recordingTitle');
  dialog.innerHTML='<form method="dialog" class="dialog-top"><h2 id="recordingTitle"></h2><button aria-label="閉じる">×</button></form><p id="recordingStyle"></p><audio controls style="width:100%" loop preload="metadata"></audio><p>Geminiで生成した完成音源です。ループ再生・音量調整・音声ファイルの保存ができます。</p><div class="rowbtns"><a class="download" id="recordingDownload">MP3を保存</a><button type="button" id="recordingOriginal">元の譜面を編集</button></div><p class="roll-hint">音符の編集は元の譜面に対応しています。完成音源の音符や楽器は個別に編集できません。</p>';
  document.body.append(dialog);player=dialog.querySelector('audio');
  originalButton=dialog.querySelector('#recordingOriginal');
  originalButton.onclick=()=>{dialog.close();bypass=true;selectedButton.click();bypass=false;};
  dialog.addEventListener('close',()=>player.pause());
 }
 selectedButton=button;originalButton.hidden=!!button.dataset.recording;player.pause();player.src=track.url;
 dialog.querySelector('#recordingTitle').textContent=track.title+' / Gemini';
 dialog.querySelector('#recordingStyle').textContent=track.style;
 const download=dialog.querySelector('#recordingDownload');download.href=track.url;download.download=track.title+'.mp3';
 dialog.showModal();player.play().catch(()=>{});
}
document.addEventListener('visibilitychange',()=>{if(document.hidden)player?.pause();});
document.addEventListener('click',event=>{
 const button=event.target.closest('[data-demo],[data-recording]');if(!button||bypass)return;
 const track=RECORDINGS[button.dataset.demo||button.dataset.recording];if(!track)return;
 event.preventDefault();event.stopImmediatePropagation();openRecording(button,track);
},true);
for(const button of document.querySelectorAll('[data-demo]')){
 if(RECORDINGS[button.dataset.demo]){
  button.setAttribute('aria-label',RECORDINGS[button.dataset.demo].title+' Gemini版を聴く');
  const small=button.querySelector('small');if(small)small.textContent='GEMINI / 完成音源';
 }
}

const gameTracks=Object.entries(RECORDINGS).filter(([id])=>!id.startsWith('sk-')&&!['garden','depth','battle'].includes(id));
if(gameTracks.length){
 const section=document.createElement('section');section.className='samples';
 section.innerHTML='<div class="samples-title"><p class="eyebrow">GAME SOUNDTRACKS / GEMINI</p><h2>ゲームごとの音楽。</h2><p>それぞれの世界観に合わせた完成音源を試聴・保存できます。</p></div><div class="sample-grid"></div>';
 for(const [id,track] of gameTracks){const button=document.createElement('button');button.className='sample depth';button.dataset.recording=id;
  const icon=document.createElement('span');icon.className='sample-art';icon.textContent='♫';icon.setAttribute('aria-hidden','true');
  const label=document.createElement('span'),name=document.createElement('b'),small=document.createElement('small');name.textContent=track.title;small.textContent='GEMINI / 完成音源';label.append(name,small);button.append(icon,label);section.querySelector('.sample-grid').append(button);}
 document.querySelector('main>footer').before(section);
}

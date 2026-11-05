// Playback state is driven by media events, not optimistic button toggles.
export function attachMusic({button,audio,status,config,signal}){
 if(!button||!audio)return ()=>{};
 let disposed=false,pending=false,generation=0;
 const local=new AbortController();const on=(el,event,fn)=>el.addEventListener(event,fn,{signal:local.signal});
 audio.volume=config.volume;audio.loop=config.loop;
 const state=(playing,busy=false)=>{button.classList.toggle('is-playing',playing);button.classList.toggle('is-loading',busy);button.setAttribute('aria-pressed',String(playing));button.setAttribute('aria-busy',String(busy));button.setAttribute('aria-label',busy?config.labels.loading:playing?config.labels.pause:config.labels.play);button.title=busy?config.labels.loading:playing?config.labels.pause:config.labels.play};
 const message=text=>{status.textContent=text;status.hidden=!text};
 const stop=()=>{generation++;pending=false;audio.pause();state(false)};
 on(button,'click',async()=>{
  if(disposed)return;
  if(pending||!audio.paused){stop();message('');return}
  const request=++generation;pending=true;message('');state(false,true);
  try{await audio.play();if(disposed||request!==generation){audio.pause();return}pending=false;state(!audio.paused)}
  catch{if(disposed||request!==generation)return;pending=false;state(false);message(config.labels.error)}
 });
 on(audio,'playing',()=>{if(disposed)return;pending=false;state(true);message('')});
 on(audio,'pause',()=>{if(!disposed){pending=false;state(false)}});
 on(audio,'ended',()=>{if(!disposed){pending=false;state(false)}});
 on(audio,'error',()=>{if(!disposed){generation++;pending=false;state(false);message(config.labels.error)}});
 const destroy=()=>{if(disposed)return;disposed=true;generation++;local.abort();audio.pause();audio.removeAttribute('src');audio.load();signal?.removeEventListener('abort',destroy)};
 if(signal?.aborted)destroy();else signal?.addEventListener('abort',destroy,{once:true});
 state(false);return destroy;
}

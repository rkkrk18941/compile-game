// Includes body consumption in the deadline so a stalled response cannot occupy a slot forever.
export async function fetchResource(url,options={},read=r=>r,timeout=12000){
  const controller=new AbortController(),parent=options.signal;
  const abort=()=>controller.abort();if(parent?.aborted)abort();else parent?.addEventListener('abort',abort,{once:true});
  let expired=false;const timer=setTimeout(()=>{expired=true;controller.abort();},timeout);
  try{return await read(await fetch(url,{...options,signal:controller.signal}));}
  catch(error){if(expired&&!parent?.aborted)throw new Error('request timed out');throw error;}
  finally{clearTimeout(timer);parent?.removeEventListener('abort',abort);}
}

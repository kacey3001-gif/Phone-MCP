/** Old foreground APKs can return cached editable text after a successful input.
 * Keep observed IDs/geometry, but don't present these values as current evidence.
 * Native companions that explicitly cleared their cache need no image fallback.
 */
export function needsForegroundTextEvidence(frame){
 return frame?.displayId===0&&frame.textFreshness?.state!=='cache_cleared'&&Array.isArray(frame.nodes)
  &&frame.nodes.some(n=>n.editable===true&&n.visible!==false&&n.text!=='[champ protégé]');
}

export function foregroundImageEvidence(image,frame){
 return !!image&&image.snapshotId===frame.snapshotId
  &&(image.packageName==null||image.packageName===frame.packageName)
  &&(frame.sessionId==null?image.sessionId==null:image.sessionId===frame.sessionId)
  &&(image.displayId==null||image.displayId===frame.displayId)
  &&image.frameContent!=='black_or_empty'&&typeof image.data==='string'&&image.data.length>0
  &&['image/jpeg','image/png'].includes(image.mimeType);
}

export function verifyForegroundText(frame,{hasImage=false}={}){
 if(!needsForegroundTextEvidence(frame))return frame;
 const ids=[];
 const nodes=frame.nodes.map(node=>{
  if(!node.editable||node.visible===false||node.text==='[champ protégé]')return node;
  ids.push(node.nodeId);
  const {text,description,...rest}=node;
  return {...rest,textVerificationRequired:true};
 });
 return {...frame,nodes,textFreshness:{state:hasImage?'verify_in_image':'unverified',editableNodeIds:ids,reason:'foreground_accessibility_cache'},
  instruction:(frame.instruction??'')+' Editable text/description omitted because this foreground companion may cache old values. '+(hasImage?'Read current values from the fresh screenshot; preserve IDs for guarded actions.':'No fresh visual evidence was obtained. Do not infer current values from a prior snapshot; request an authorized screenshot or report that the value is unverified.')};
}

export async function foregroundTextEvidence(command,frame,args){
 if(!needsForegroundTextEvidence(frame))return frame;
 const result={...frame};
 try{
  const image=await command('screenshot',{packageName:args.packageName,sessionId:args.sessionId,_ownerKey:args._ownerKey,snapshotId:frame.snapshotId,maxDimension:args.maxDimension,quality:args.quality,annotate:args.annotate});
  if(!foregroundImageEvidence(image,frame))throw Error('No usable screenshot bound to the editable-text observation.');
  result.screenshot=image;
 }catch(error){result.screenshotError=String(error?.message??error);}
 return verifyForegroundText(result,{hasImage:!!result.screenshot});
}

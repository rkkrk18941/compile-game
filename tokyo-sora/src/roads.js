// Loaded-road topology shared by walkers, cars, arrival placement and walking routes.
// Tile boundaries are data partitions, not physical dead ends. Heights prevent bridge joins.
const cell = (x,z) => Math.floor(x/2)+','+Math.floor(z/2);
const nodeKey = (t,n) => t.key+':'+n;
export const edgeAllowed = (g,e,kind,dir=1) => kind==='car'
  ? g.eCar?.[e]>0 && g.eCls[e]<8 && (!g.eOne[e] || Math.sign(g.eOne[e])===dir)
  : g.ePed?.[e]>0 && !g.eElevated?.[e] && !g.eRestricted?.[e];
export function pointOnEdge(t,e,s) {
  const g=t.graph, st=g.eS[e], count=g.eC[e];let along=0;
  for(let j=1;j<count;j++) {
    const k=(st+j-1)*3,dx=g.pts[k+3]-g.pts[k],dz=g.pts[k+5]-g.pts[k+2],len=Math.hypot(dx,dz);
    if(s<=along+len||j===count-1) {const u=len?Math.max(0,Math.min(1,(s-along)/len)):0;return {x:t.cx+g.pts[k]+dx*u,y:g.pts[k+1]+(g.pts[k+4]-g.pts[k+1])*u,z:t.cz+g.pts[k+2]+dz*u,dx:dx/(len||1),dz:dz/(len||1)};}
    along+=len;
  }
  return null;
}
export function edgePath(t,e,from=0,to=t.graph.eLen[e]) {
  if(from>to)return edgePath(t,e,to,from).reverse();
  const start=pointOnEdge(t,e,from),end=pointOnEdge(t,e,to);if(!start||!end)return [];
  const out=[start],g=t.graph;let along=0;
  for(let j=1;j<g.eC[e];j++) {const k=(g.eS[e]+j)*3;along+=Math.hypot(g.pts[k]-g.pts[k-3],g.pts[k+2]-g.pts[k-1]);if(along>from&&along<to)out.push({x:g.pts[k]+t.cx,y:g.pts[k+1],z:g.pts[k+2]+t.cz});}
  out.push(end);return out;
}
class Heap {
  constructor(){this.a=[];}
  push(v){const a=this.a;let i=a.length;a.push(v);while(i){const p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;}
  pop(){const a=this.a,r=a[0],v=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let k=i*2+1;if(k+1<a.length&&a[k+1].f<a[k].f)k++;if(a[k].f>=v.f)break;a[i]=a[k];i=k;}a[i]=v;}return r;}
}
export class RoadNetwork {
  constructor(city){this.city=city;this.revision=-1;this.boundaries=new Map();}
  sync(){
    if(this.revision===this.city.graphRevision)return;
    this.revision=this.city.graphRevision;this.boundaries.clear();
    for(const t of this.city.graphTiles()){
      const g=t.graph;
      for(let n=0;n<g.nodes.length/3;n++){
        const k=n*3,x=t.cx+g.nodes[k],y=g.nodes[k+1],z=t.cz+g.nodes[k+2];
        if(Math.min(Math.abs(x-t.b[0]),Math.abs(x-t.b[2]),Math.abs(z-t.b[1]),Math.abs(z-t.b[3]))>3)continue;
        const key=cell(x,z);if(!this.boundaries.has(key))this.boundaries.set(key,[]);this.boundaries.get(key).push({t,n,x,y,z});
      }
    }
  }
  joints(t,n){
    this.sync();const g=t.graph,k=n*3,x=t.cx+g.nodes[k],y=g.nodes[k+1],z=t.cz+g.nodes[k+2],out=[];
    if(Math.min(Math.abs(x-t.b[0]),Math.abs(x-t.b[2]),Math.abs(z-t.b[1]),Math.abs(z-t.b[3]))>3)return out;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)for(const q of this.boundaries.get(cell(x+dx*2,z+dz*2))||[]){
      if(q.t===t||Math.abs(y-q.y)>2||Math.hypot(x-q.x,z-q.z)>1.8)continue;
      out.push({...q,distance:Math.hypot(x-q.x,z-q.z)});
    }
    return out;
  }
  exits(t,n,kind){
    const g=t.graph,out=[];
    for(let k=g.adjStart[n];k<g.adjStart[n+1];k++){
      const e=g.adj[k],dir=g.eA[e]===n?1:-1;
      if(edgeAllowed(g,e,kind,dir))out.push({t,e,dir,node:dir>0?g.eB[e]:g.eA[e]});
    }
    return out;
  }
  continuations(t,e,dir,kind){
    const g=t.graph,n=dir>0?g.eB[e]:g.eA[e];
    return [...this.exits(t,n,kind).filter(q=>q.e!==e),...this.joints(t,n).flatMap(q=>this.exits(q.t,q.n,kind))];
  }
  nearest(x,z,maxDistance=180,kind='ped'){
    let best=null,bd=maxDistance*maxDistance;
    for(const t of this.city.graphTiles()){
      if(x<t.b[0]-maxDistance||x>t.b[2]+maxDistance||z<t.b[1]-maxDistance||z>t.b[3]+maxDistance)continue;
      const g=t.graph;
      for(let e=0;e<g.eS.length;e++){
        if(!edgeAllowed(g,e,kind,1)&&!edgeAllowed(g,e,kind,-1))continue;
        let along=0;
        for(let j=1;j<g.eC[e];j++){
          const k=(g.eS[e]+j-1)*3,ax=t.cx+g.pts[k],az=t.cz+g.pts[k+2],dx=g.pts[k+3]-g.pts[k],dz=g.pts[k+5]-g.pts[k+2],l2=dx*dx+dz*dz,L=Math.sqrt(l2);
          if(!L)continue;
          const u=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/l2)),qx=ax+dx*u,qz=az+dz*u,d2=(x-qx)**2+(z-qz)**2;
          if(d2<bd){bd=d2;best={t,e,s:along+u*L,x:qx,z:qz,y:g.pts[k+1]+(g.pts[k+4]-g.pts[k+1])*u,dx:dx/L,dz:dz/L,distance:Math.sqrt(d2)};}
          along+=L;
        }
      }
    }
    return best;
  }
  arrival(x,z,solidAt){
    const q=this.nearest(x,z);if(!q)return null;const g=q.t.graph,hw=g.eHW[q.e],sw=g.eSW[q.e];
    const side=(x-q.x)*q.dz-(z-q.z)*q.dx>=0?1:-1;
    const off=g.eCls[q.e]===8?Math.min(.45,hw*.3):sw>0?hw+sw*.5:Math.max(.3,hw-.5);
    for(const sign of [side,-side]) {const p={x:q.x+q.dz*off*sign,y:q.y,z:q.z-q.dx*off*sign};if(!solidAt||!solidAt(p.x,p.y+1,p.z))return {...p,yaw:Math.atan2(q.dx,-q.dz)};}
    return null;
  }
  route(x,z,tx,tz){
    const start=this.nearest(x,z),goal=this.nearest(tx,tz);if(!start||!goal)return {status:'unavailable',points:[]};
    const heap=new Heap(),cost=new Map(),prev=new Map(),nodes=new Map(),sg=start.t.graph,gg=goal.t.graph;
    const targetEnds=new Map([[nodeKey(goal.t,gg.eA[goal.e]),goal.s],[nodeKey(goal.t,gg.eB[goal.e]),gg.eLen[goal.e]-goal.s]]);
    const seed=(n,c)=>{const key=nodeKey(start.t,n),old=cost.get(key);if(old!==undefined&&old<=c)return;cost.set(key,c);nodes.set(key,{t:start.t,n});prev.set(key,null);heap.push({key,f:c});};
    seed(sg.eA[start.e],start.s);seed(sg.eB[start.e],sg.eLen[start.e]-start.s);
    let best=start.t===goal.t&&start.e===goal.e?Math.abs(goal.s-start.s):Infinity,finish=null,visited=0;
    while(heap.a.length&&visited++<30000){
      const it=heap.pop(),d=cost.get(it.key);if(it.f!==d)continue;if(d>=best)break;
      if(targetEnds.has(it.key)){const total=d+targetEnds.get(it.key);if(total<best){best=total;finish=it.key;}}
      const{t,n}=nodes.get(it.key),g=t.graph;
      const links=this.exits(t,n,'ped').map(q=>({...q,n:q.node,length:g.eLen[q.e],edge:q}));
      for(const q of this.joints(t,n))links.push({...q,length:q.distance,edge:null});
      for(const q of links){const key=nodeKey(q.t,q.n),nd=d+q.length;if(nd>=(cost.get(key)??Infinity))continue;cost.set(key,nd);nodes.set(key,{t:q.t,n:q.n});prev.set(key,{key:it.key,edge:q.edge});heap.push({key,f:nd});}
    }
    if(!Number.isFinite(best))return {status:visited>=30000?'limited':'unavailable',points:[]};
    let points=[];
    if(finish===null)points=edgePath(start.t,start.e,start.s,goal.s);
    else{
      const chain=[];let k=finish;while(prev.get(k)){const p=prev.get(k);chain.push({from:nodes.get(p.key),to:nodes.get(k),edge:p.edge});k=p.key;}chain.reverse();
      const first=nodes.get(k);points.push(...edgePath(start.t,start.e,start.s,first.n===sg.eA[start.e]?0:sg.eLen[start.e]));
      for(const q of chain){if(q.edge)points.push(...edgePath(q.edge.t,q.edge.e,q.edge.dir>0?0:q.edge.t.graph.eLen[q.edge.e],q.edge.dir>0?q.edge.t.graph.eLen[q.edge.e]:0));}
      const end=nodes.get(finish);points.push(...edgePath(goal.t,goal.e,end.n===gg.eA[goal.e]?0:gg.eLen[goal.e],goal.s));
    }
    return {status:'ready',points,distance:best,startDistance:start.distance,endDistance:goal.distance};
  }
}

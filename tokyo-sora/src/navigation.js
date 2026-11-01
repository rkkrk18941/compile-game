import * as THREE from 'three';
import { addCurvature } from './shaders.js';

export class WalkingRoute {
  constructor(scene,city,dem){
    this.city=city;this.dem=dem;this.next=0;this.result={status:'none',points:[]};this.dest=null;this.revision=-1;
    this.mesh=new THREE.Mesh(new THREE.BufferGeometry(),addCurvature(new THREE.MeshBasicMaterial({color:'#f6d86c',side:THREE.DoubleSide,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2})));
    this.mesh.name='walking-route';this.mesh.visible=false;this.mesh.renderOrder=2;scene.add(this.mesh);
  }
  update(dt,x,z,dest,walking){
    this.next-=dt;
    if(!dest||!walking){this.mesh.visible=false;this.dest=null;this.result={status:'none',points:[]};return;}
    const changed=this.dest!==dest||this.revision!==this.city.graphRevision||Math.hypot(x-(this.x??Infinity),z-(this.z??Infinity))>8;
    if(!changed||this.next>0&&this.dest===dest)return;
    this.next=1.5;this.dest=dest;this.revision=this.city.graphRevision;this.x=x;this.z=z;
    this.result=this.city.roads.route(x,z,dest.x,dest.z);
    this.mesh.visible=this.result.status==='ready';
    if(!this.mesh.visible)return;
    const positions=[],points=this.result.points;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,L=Math.hypot(dx,dz);if(L<.02)continue;
      const steps=Math.min(200,Math.ceil(L/8)),nx=-dz/L*.38,nz=dx/L*.38;
      for(let j=0;j<steps;j++){
        const u=j/steps,v=(j+1)/steps;
        const ax=a.x+dx*u,az=a.z+dz*u,bx=a.x+dx*v,bz=a.z+dz*v;
        const A=[ax+nx,this.dem.heightAt(ax+nx,az+nz)+.3,az+nz],B=[ax-nx,this.dem.heightAt(ax-nx,az-nz)+.3,az-nz];
        const C=[bx+nx,this.dem.heightAt(bx+nx,bz+nz)+.3,bz+nz],D=[bx-nx,this.dem.heightAt(bx-nx,bz-nz)+.3,bz-nz];
        positions.push(...A,...B,...C,...B,...D,...C);
      }
    }
    this.mesh.geometry.dispose();this.mesh.geometry=new THREE.BufferGeometry();this.mesh.geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));this.mesh.geometry.computeBoundingSphere();
  }
}

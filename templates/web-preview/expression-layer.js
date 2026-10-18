/** Smooth parameter overlays, recomputed from each frame's input without accumulation. */
const ease = t => t*t*t*(t*(t*6-15)+10);
const identity = () => ({a:1,b:0});

export class ExpressionLayer {
  constructor() { this.reset(); }
  reset() { this.current=new Map();this.from=new Map();this.target=new Map();this.elapsed=0;this.duration=0; }
  set(rows=[],seconds=.35) {
    this.from=new Map([...this.current].map(([id,v])=>[id,{...v}]));this.target=new Map();
    for(const row of rows) {
      if(!row || typeof row.Id!=='string' || !row.Id || !Number.isFinite(row.Value))continue;
      const v=row.Value,mode=row.Blend||'Add';
      if(!['Add','Multiply','Overwrite'].includes(mode))continue;
      const next=mode==='Overwrite'?{a:0,b:v}:mode==='Multiply'?{a:v,b:0}:{a:1,b:v};
      const prior=this.target.get(row.Id)||identity();
      this.target.set(row.Id,{a:next.a*prior.a,b:next.a*prior.b+next.b});
    }
    this.elapsed=0;this.duration=Number.isFinite(seconds)&&seconds>=0?seconds:.35;
    this.step(0);
  }
  step(dt) {
    if(Number.isFinite(dt)&&dt>0)this.elapsed+=Math.min(dt,.05);
    const t=this.duration===0?1:ease(Math.min(1,this.elapsed/this.duration));
    const ids=new Set([...this.from.keys(),...this.target.keys()]);
    this.current=new Map();
    for(const id of ids) {
      const a=this.from.get(id)||identity(),b=this.target.get(id)||identity();
      const v={a:a.a+(b.a-a.a)*t,b:a.b+(b.b-a.b)*t};
      if(t<1 || this.target.has(id))this.current.set(id,v);
    }
    return this;
  }
  apply(read,write) {
    for(const [id,v] of this.current) {
      const base=read(id);
      if(Number.isFinite(base))write(id,base*v.a+v.b);
    }
  }
}

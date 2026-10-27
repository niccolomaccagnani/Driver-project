"""Compare fixed 2D visual references, reporting paired errors and coverage separately."""
import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/monza-matplotlib')
import json,pathlib,numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=pathlib.Path(__file__).resolve().parents[1]
old=json.loads((root.parent/'steering.json').read_text());new=json.loads((root/'steering.json').read_text())
assert len(old)==len(new)==2835
assert all(a['frame_index']==b['frame_index'] and a['video_time_s']==b['video_time_s'] for a,b in zip(old,new))
summary={'reference_note':'Coarse human visual annotations of apparent rim orientation, usually ±5°, sometimes ±7°; not sensor ground truth. Development references were used during iteration. Holdout references were annotated before evaluating the final method on them; no parameters changed after that evaluation.','video':{},'audits':{}}
for name,rows in [('previous',old),('refined',new)]:
 summary['video'][name]={'frames':len(rows),'returned':sum(r['steering_apparent_deg'] is not None for r in rows),'observed':sum(r['status']=='visual_orientation_estimate' for r in rows),'reconstructed':sum(r['status']=='short_gap_reconstructed' for r in rows),'unreadable':sum(r['status']=='unreadable' for r in rows)}
for label in ['development','holdout']:
 refs=json.loads((root/f'audit/{label}-references.json').read_text());results=[]
 for ref in refs:
  i=ref['frame_index'];assert abs(old[i]['video_time_s']-ref['actual_s'])<.00001
  row=dict(ref)
  for name,rows in [('previous',old),('refined',new)]:
   v=rows[i]['steering_apparent_deg'];gt=ref['reference_apparent_angle_deg']
   row[name+'_deg']=v;row[name+'_error']=abs(v-gt) if v is not None and gt is not None else None
  results.append(row)
 paired=[r for r in results if r['previous_error'] is not None and r['refined_error'] is not None]
 metrics={'total_frames':len(refs),'visually_readable':sum(r['visible_rim'] for r in refs),'paired_count':len(paired)}
 for name in ['previous','refined']:
  errors=[r[name+'_error'] for r in results if r[name+'_error'] is not None];pe=[r[name+'_error'] for r in paired]
  active=[r for r in paired if abs(r['reference_apparent_angle_deg'])>10]
  metrics[name]={'returned_on_readable':len(errors),'mae_all_returned_apparent_deg':float(np.mean(errors)),'paired_mae_apparent_deg':float(np.mean(pe)),'paired_median_apparent_deg':float(np.median(pe)),'paired_max_apparent_deg':float(max(pe)),'paired_active_sign_errors':int(sum(np.sign(r[name+'_deg'])!=np.sign(r['reference_apparent_angle_deg']) for r in active)),'paired_active_signed_references':len(active)}
 summary['audits'][label]=metrics
 (root/f'audit/{label}-results.json').write_text(json.dumps(results,indent=2))
(root/'audit/summary.json').write_text(json.dumps(summary,indent=2))
# Validation of signed values, missing data and short reconstructed intervals.
assert np.median([r['steering_apparent_deg'] for r in new if 6<r['video_time_s']<8 and r['steering_apparent_deg'] is not None])>15
assert np.median([r['steering_apparent_deg'] for r in new if 19<r['video_time_s']<22 and r['steering_apparent_deg'] is not None])<-10
for i,r in enumerate(new):
 assert r['frame_index']==i
 assert (r['steering_apparent_deg'] is None)==(r['status']=='unreadable')
 if r['status']=='visual_orientation_estimate':assert r['selected_segment'] is not None
 else:assert r['selected_segment'] is None
 assert r['selected_angle_raw_deg'] is None or r['status']=='visual_orientation_estimate'
i=0
while i<len(new):
 if new[i]['status']!='short_gap_reconstructed':i+=1;continue
 a=i
 while i<len(new) and new[i]['status']=='short_gap_reconstructed':i+=1
 assert a>0 and i<len(new) and new[i]['video_time_s']-new[a-1]['video_time_s']<=.25
# Plot the previous and refined curves together without connecting unreadable frames.
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10})
fig,axes=plt.subplots(2,1,figsize=(16,9),dpi=130,gridspec_kw={'height_ratios':[1.5,1]});fig.patch.set_facecolor('#f3f6fa');fig.subplots_adjust(left=.08,right=.97,top=.80,bottom=.16,hspace=.34)
for ax,limits in zip(axes,[(0,94.35),(0,25)]):
 ax.set_facecolor('white');ax.grid(color='#e2e9f2');ax.axhline(0,color='#8fa1b9',lw=.8)
 for name,rows,color,width in [('Precedente',old,'#aab7c8',1.2),('Tracciamento controllato',new,'#1865dc',1.6)]:
  times=np.array([r['video_time_s'] for r in rows]);values=np.array([r['steering_apparent_deg'] if r['steering_apparent_deg'] is not None else np.nan for r in rows]);ax.plot(times,values,color=color,lw=width,label=name)
  if name!='Precedente':
   mask=np.array([r['status']=='short_gap_reconstructed' for r in rows]);ax.plot(times,np.where(mask,values,np.nan),color='#c28a1b',lw=2,ls='--')
 ax.set_xlim(*limits);ax.set_ylim(-80,80);ax.set_ylabel('Orientamento apparente (°)');ax.set_xlabel('Tempo nel video (s)');ax.legend(loc='lower right',fontsize=9)
fig.text(.06,.95,'DRIVING NOTES / TRACCIAMENTO CONTROLLATO',color='#72839b',fontsize=10,weight='bold');fig.text(.06,.90,'Sterzo: destra +, sinistra −',fontsize=25,color='#172d49',weight='bold')
fig.text(.06,.85,'Bordo centrale verificato · filtro locale · buchi lunghi lasciati vuoti',color='#637890',fontsize=12)
fig.text(.06,.095,'14 nuovi controlli leggibili: scarto medio visivo 3,6° → 2,1°. Annotazioni approssimative ±5–7°, non gradi meccanici.',color='#6d623f',fontsize=10)
fig.text(.06,.06,'Stima disponibile nell’84,5% dei fotogrammi (prima 97,6%): maggiore selettività, non maggiore copertura.',color='#637890',fontsize=10)
fig.savefig(root/'sterzo-stimato.png',facecolor=fig.get_facecolor())
print(json.dumps(summary,indent=2));print('PASS: timestamps match baseline; sign, statuses, segments and maximum reconstructed gap verified.')

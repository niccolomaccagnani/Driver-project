"""Audit image-plane angles, paired coverage, difficult transitions, and data integrity."""
import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/monza-matplotlib')
import pathlib,json,csv,numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=pathlib.Path(__file__).resolve().parents[1];new=json.loads((root/'steering.json').read_text());previous=json.loads((root.parent/'refined/steering.json').read_text());first=json.loads((root.parent/'steering.json').read_text());meta=json.loads((root/'metadata.json').read_text())
summary={'note':'All references are approximate visual image-plane annotations (±5–7 degrees), not mechanical-angle ground truth. These are development and diagnostic checks; parameters were iterated after reviewing difficult transitions. No independent accuracy certification is claimed.','video':{},'checks':{}}
for name,rs in [('first',first),('previous',previous),('rotation_model',new)]:
 summary['video'][name]={'frames':len(rs),'returned':sum(r['steering_apparent_deg'] is not None for r in rs),'reconstructed':sum(r['status']=='short_gap_reconstructed' for r in rs),'unreadable':sum(r['status']=='unreadable' for r in rs)}
for label in ['development','prior-checks','difficult-transitions']:
 refs=json.loads((root/f'audit/{label}-references.json').read_text());results=[]
 for ref in refs:
  i=ref['frame_index'];assert abs(new[i]['video_time_s']-ref['actual_s'])<.00001
  row=dict(ref)
  for name,rs in [('first',first),('previous',previous),('rotation_model',new)]:
   value=rs[i]['steering_apparent_deg'];gt=ref['reference_apparent_angle_deg'];row[name+'_deg']=value;row[name+'_error']=abs(value-gt) if value is not None and gt is not None else None
  results.append(row)
 paired=[r for r in results if r['previous_error'] is not None and r['rotation_model_error'] is not None];metrics={'total_reviewed':len(refs),'readable_references':sum(r['visible_rim'] for r in refs),'paired_previous_new':len(paired)}
 for name in ['first','previous','rotation_model']:
  errors=[r[name+'_error'] for r in results if r[name+'_error'] is not None];paired_errors=[r[name+'_error'] for r in paired if r[name+'_error'] is not None];active=[r for r in paired if abs(r['reference_apparent_angle_deg'])>10 and r[name+'_deg'] is not None]
  metrics[name]={'returned_on_readable':len(errors),'mae_all_returned':float(np.mean(errors)),'paired_mae':float(np.mean(paired_errors)) if paired_errors else None,'paired_max':max(paired_errors) if paired_errors else None,'paired_sign_errors':int(sum(np.sign(r[name+'_deg'])!=np.sign(r['reference_apparent_angle_deg']) for r in active)),'paired_active_references':len(active)}
 summary['checks'][label]=metrics;(root/f'audit/{label}-results.json').write_text(json.dumps(results,indent=2))
(root/'audit/summary.json').write_text(json.dumps(summary,indent=2))
assert len(new)==len(previous)==2835
assert all(a['frame_index']==i and a['video_time_s']==previous[i]['video_time_s'] for i,a in enumerate(new))
assert all((r['steering_apparent_deg'] is None)==(r['status']=='unreadable') for r in new)
assert sum(r['steering_apparent_deg'] is not None for r in new)==meta['returned']
assert len(list(csv.DictReader((root/'steering.csv').open())))==2835
# These checks refer to recognizable source-video manoeuvres, not the implementation formula.
right=[r['steering_apparent_deg'] for r in new if 6<r['video_time_s']<8 and r['steering_apparent_deg'] is not None]
left=[r['steering_apparent_deg'] for r in new if 53.7<r['video_time_s']<54.6 and r['steering_apparent_deg'] is not None]
assert np.median(right)>20 and len(left)>5 and np.median(left)<-30
unwind=min(new,key=lambda r:abs(r['video_time_s']-8.051667));assert unwind['steering_apparent_deg'] is not None and abs(unwind['steering_apparent_deg'])<6
assert all(r['selected_segment'] is None for r in new if r['status']!='visual_orientation_estimate')
assert all(r['steering_apparent_deg'] is None or r['steering_apparent_deg']>-20 for r in new if 61.30<r['video_time_s']<61.39)
i=0
while i<len(new):
 if new[i]['status']!='short_gap_reconstructed':i+=1;continue
 a=i
 while i<len(new) and new[i]['status']=='short_gap_reconstructed':i+=1
 assert a>0 and i<len(new) and new[i]['video_time_s']-new[a-1]['video_time_s']<=.3+1e-6
# Preserve missing intervals in the plot; show rapid unwinding and a previously reversed turn.
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10})
fig,axes=plt.subplots(3,1,figsize=(16,11),dpi=130,gridspec_kw={'height_ratios':[1.4,1,1]});fig.patch.set_facecolor('#f3f6fa');fig.subplots_adjust(left=.08,right=.97,top=.84,bottom=.13,hspace=.40)
for ax,(lo,hi),title in zip(axes,[(0,94.35),(5.5,9),(52,56)],['Video completo','Rientro rapido verso lo zero','Sterzata a sinistra: correzione del segno']):
 ax.set_facecolor('white');ax.grid(color='#e2e9f2');ax.axhline(0,color='#8fa1b9',lw=.8)
 for name,rs,col in [('Versione precedente',previous,'#aab7c8'),('Modello di rotazione',new,'#1865dc')]:
  t=np.array([r['video_time_s'] for r in rs]);v=np.array([r['steering_apparent_deg'] if r['steering_apparent_deg'] is not None else np.nan for r in rs]);ax.plot(t,v,lw=1.6,color=col,label=name)
 ax.set_xlim(lo,hi);ax.set_ylim(-80,80);ax.set_ylabel('Orientamento apparente (°)');ax.set_xlabel('Tempo nel video (s)');ax.set_title(title,loc='left',color='#213a58',fontsize=11,weight='bold');ax.legend(loc='lower right',fontsize=9)
fig.text(.06,.96,'DRIVING NOTES / MODELLO DI ROTAZIONE',fontsize=10,color='#72839b',weight='bold');fig.text(.06,.92,'Seguire il volante, mantenendo il riferimento',fontsize=23,color='#172d49',weight='bold');fig.text(.06,.88,'Geometria del bordo + coppie di LED + movimento fra fotogrammi · destra + / sinistra −',fontsize=11,color='#637890')
fig.text(.06,.075,'Stima visiva 2D, non gradi meccanici calibrati. I tratti coperti o ambigui possono rimanere vuoti.',fontsize=10,color='#6d623f');fig.text(.06,.045,f"Campioni restituiti: {meta['returned']}/2.835; {meta['reconstructed']} ricostruiti su buchi brevi. Il video sovrapposto permette il controllo diretto.",fontsize=10,color='#637890');fig.savefig(root/'sterzo-stimato.png',facecolor=fig.get_facecolor())
print(json.dumps(summary,indent=2));print('PASS: original timestamps, CSV, signed manoeuvres, rapid unwind, missing intervals and reconstruction limit.')

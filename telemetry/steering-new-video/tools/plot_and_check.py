import os
os.environ['MPLCONFIGDIR']='/tmp/monza-matplotlib'
import csv,json,pathlib,math
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
root=pathlib.Path(__file__).resolve().parents[1];rows=json.loads((root/'steering.json').read_text());meta=json.loads((root/'metadata.json').read_text())
t=np.array([r['video_time_s'] for r in rows]);v=np.array([r['steering_apparent_deg'] if r['steering_apparent_deg'] is not None else np.nan for r in rows]);raw=np.array([r['selected_angle_raw_deg'] if r['selected_angle_raw_deg'] is not None else np.nan for r in rows]);reconstructed=np.array([r['status']=='short_gap_reconstructed' for r in rows])
# Coarse visual checks on clearly visible upper-rim segments, not mechanical ground truth.
refs=[(2,[1180,1121],[1360,1122]),(10,[1120,1134],[1320,1108]),(20,[1100,1163],[1300,1090]),(30,[1110,1083],[1380,1160]),(60,[1090,1100],[1320,1152]),(25,[1130,1123],[1390,1125]),(90,[1140,1122],[1380,1124])]
checks=[]
for time,p1,p2 in refs:
 reference=math.degrees(math.atan2(p2[1]-p1[1],p2[0]-p1[0]));i=int(np.argmin(abs(t-time)));value=float(v[i]);checks.append(dict(requested_video_time_s=time,frame_index=rows[i]['frame_index'],p1=p1,p2=p2,reference_apparent_angle_deg=reference,estimate_deg=value,abs_difference_deg=abs(value-reference),annotation_uncertainty_deg=5))
assert len(rows)==2835 and np.all(np.diff(t)>0)
assert all(r['steering_apparent_deg'] is None for r in rows if r['status']=='unreadable')
assert max(r['abs_difference_deg'] for r in checks)<8
assert np.nanmedian(v[(t>6)&(t<8)])>15 # first visible right turn
assert np.nanmedian(v[(t>19)&(t<22)])<-10 # visible left turn
meta['visual_spot_checks']=len(checks);meta['spot_check_max_abs_difference_deg']=max(r['abs_difference_deg'] for r in checks);meta['spot_check_note']='Seven selected visible 2D rim segments, approximate annotation ±5 deg; not full-video or mechanical-angle validation.';meta['search_range_apparent_deg']=[-75,75]
(root/'metadata.json').write_text(json.dumps(meta,indent=2));(root/'visual-checks.json').write_text(json.dumps(checks,indent=2))
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':11})
fig,axes=plt.subplots(2,1,figsize=(16,9),dpi=130,gridspec_kw={'height_ratios':[1.6,1]});fig.patch.set_facecolor('#f3f6fa');fig.subplots_adjust(left=.095,right=.97,top=.79,bottom=.15,hspace=.34)
for a in axes:
 a.set_facecolor('white');a.grid(color='#e2e9f2');a.axhline(0,color='#8fa1b9',lw=1);a.set_ylim(-80,80);a.tick_params(colors='#60738e')
 for sp in a.spines.values():sp.set_visible(False)
 a.plot(t,raw,color='#c2ccd9',lw=.6,alpha=.8);a.plot(t,v,color='#1865dc',lw=1.6)
 a.fill_between(t,0,v,where=v>=0,color='#1865dc',alpha=.08);a.fill_between(t,0,v,where=v<0,color='#da7b27',alpha=.08)
 a.plot(t,np.where(reconstructed,v,np.nan),color='#cf901d',lw=2,ls='--');a.set_ylabel('Orientamento visivo\nstimato (°)',color='#526984')
axes[0].set_xlim(0,94.35);axes[0].set_title('Video completo',loc='left',fontsize=12,weight='bold',color='#213a58');axes[1].set_xlim(0,25);axes[1].set_title('Dettaglio dei primi 25 secondi',loc='left',fontsize=12,weight='bold',color='#213a58');axes[1].set_xlabel('Tempo nel video (secondi)',color='#526984')
fig.text(.055,.956,'DRIVING NOTES / NUOVO VIDEO',fontsize=10,weight='bold',color='#72839b')
fig.text(.055,.909,'Sterzo stimato: destra +, sinistra −',fontsize=25,weight='bold',color='#172d49')
fig.text(.055,.866,'Bordo del volante e LED · stima automatica con filtro progressivo · 2.835 fotogrammi',fontsize=12,color='#637890')
fig.text(.055,.827,'Blu: curva filtrata     Grigio: prima del filtro     Tratteggio ambra: breve ricostruzione',fontsize=10,color='#637890')
fig.text(.055,.078,'Gradi apparenti nell’immagine, non angolo meccanico calibrato. I tratti non leggibili restano vuoti.',fontsize=11,color='#6d623f')
fig.text(.055,.046,'Nel pacchetto interattivo il video con la linea sovrapposta consente di verificare il tracciamento e i tratti deboli.',fontsize=10,color='#74859c')
fig.savefig(root/'sterzo-stimato.png',facecolor=fig.get_facecolor())
print('Data checks and 7 coarse visual spot checks passed. Max apparent-angle discrepancy:',meta['spot_check_max_abs_difference_deg'])

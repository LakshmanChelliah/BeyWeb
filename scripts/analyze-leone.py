import trimesh
import numpy as np

print('loading...')
scene = trimesh.load('Rock_Leone.glb')
if isinstance(scene, trimesh.Scene):
    mesh = trimesh.util.concatenate(tuple(
        g for g in scene.geometry.values() if isinstance(g, trimesh.Trimesh)
    ))
else:
    mesh = scene

v = mesh.vertices
print('verts', len(v), 'faces', len(mesh.faces))

# z-up
cx, cy = v[:,0].mean(), v[:,1].mean()
r = np.hypot(v[:,0]-cx, v[:,1]-cy)
z = v[:,2]
z0, z1 = z.min(), z.max()
hn = (z - z0) / (z1 - z0)
rn = r / r.max()

# histogram by height
bins = np.linspace(0, 1, 21)
for i in range(len(bins)-1):
    m = (hn >= bins[i]) & (hn < bins[i+1])
    if not m.any():
        continue
    print(f'h {bins[i]:.2f}-{bins[i+1]:.2f}: count={m.sum():6d} r_mean={rn[m].mean():.3f} r_min={rn[m].min():.3f} r_max={rn[m].max():.3f}')

# top cap verts
n = mesh.vertex_normals
top = n[:,2] > 0.85
print('\nTop-facing verts:', top.sum())
for lo, hi in [(0.0,0.25),(0.25,0.45),(0.45,0.65),(0.65,0.85),(0.85,1.01)]:
    m = top & (rn >= lo) & (rn < hi)
    print(f'  top r {lo}-{hi}: {m.sum()}')

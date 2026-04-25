'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface FnEntry {
  id: string;
  name: string;
  file: string;
  moduleId?: string;
  calls?: string[];
  calledBy?: string[];
  startLine?: number;
  endLine?: number;
  purpose?: string;
  params?: { name: string; type: string }[];
  returnType?: string;
}

interface LockData {
  version: string;
  generatedAt?: string;
  projectRoot?: string;
  modules?: Record<string, { id: string; files: string[] }>;
  functions?: Record<string, FnEntry>;
  fnIndex?: string[];
  graph?: { nodes: number; edges: number };
}

interface GraphNode {
  id: string;
  name: string;
  file: string;
  moduleId: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
}

interface GraphEdge {
  source: string;
  target: string;
}

const MODULE_COLORS: Record<string, string> = {
  authentication: '#f87171',
  database: '#4ade80',
  api: '#fb923c',
  core: '#4ade80',
  cli: '#f87171',
  web: '#60a5fa',
  components: '#818cf8',
  lib: '#34d399',
  hooks: '#a78bfa',
  providers: '#f472b6',
  utils: '#2dd4bf',
  cache: '#fbbf24',
  search: '#38bdf8',
  parser: '#c084fc',
  graph: '#60a5fa',
  analysis: '#c084fc',
  security: '#f87171',
  payment: '#fbbf24',
  test: '#94a3b8',
};

function getModuleColor(moduleId: string): string {
  if (!moduleId) return '#94a3b8';
  const key = Object.keys(MODULE_COLORS).find(k => moduleId.toLowerCase().includes(k));
  return key ? MODULE_COLORS[key] : '#94a3b8';
}

function getRelativePath(filePath: string | undefined, projectRoot?: string | undefined): string {
  if (!filePath || typeof filePath !== 'string') return 'unknown';
  if (!projectRoot || typeof projectRoot !== 'string') return filePath.split(/[/\\]/).slice(-3).join('/');
  try {
    return filePath.replace(projectRoot, '').replace(/^[/\\]/, '').split(/[/\\]/).slice(-2).join('/');
  } catch {
    return filePath.split(/[/\\]/).slice(-3).join('/');
  }
}

export default function VisualizePage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [lock, setLock] = useState<LockData | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
const [highlighted] = useState<Set<string>>(new Set());
  const [moduleFilter, setModuleFilter] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [stats, setStats] = useState({ functions: 0, modules: 0, connections: 0 });

  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const animationRef = useRef<number>(0);
  const simulationStepRef = useRef<(() => void) | null>(null);

  // Parse uploaded lock file
  const parseLock = useCallback((data: LockData) => {
    const fnIndex = data.fnIndex || [];
    const functions = data.functions || {};
    const modules = data.modules || {};
    
    const graphNodes: GraphNode[] = [];
    const graphEdges: GraphEdge[] = [];
    const nodeMap = new Map<string, GraphNode>();

    // Build nodes from functions
    let idx = 0;
    for (const [id, fn] of Object.entries(functions)) {
      if (!fn.name) continue;
      
      const moduleId = fn.moduleId || 'unknown';
      const angle = (idx / Object.keys(functions).length) * Math.PI * 2;
      const radius = 150 + Math.random() * 100;
      
      graphNodes.push({
        id: fnIndex[idx] || id,
        name: fn.name,
        file: fn.file,
        moduleId,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        vx: 0,
        vy: 0,
        radius: 8,
        color: getModuleColor(moduleId),
      });
      nodeMap.set(fnIndex[idx] || id, graphNodes[graphNodes.length - 1]);
      idx++;
    }

    // Build edges from calls
    for (const [id, fn] of Object.entries(functions)) {
      const sourceId = fnIndex[Object.keys(functions).findIndex(k => k === id)] || id;
      if (!nodeMap.has(sourceId)) continue;
      
      for (const callId of fn.calls || []) {
        const targetId = fnIndex[parseInt(callId as unknown as string, 10)] || callId;
        if (nodeMap.has(targetId) && sourceId !== targetId) {
          graphEdges.push({ source: sourceId, target: targetId });
        }
      }
    }

    setNodes(graphNodes);
    setEdges(graphEdges);
    setStats({
      functions: Object.keys(functions).length,
      modules: Object.keys(modules).length,
      connections: graphEdges.length,
    });
    setLock(data);
  }, []);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          parseLock(data);
        } catch (err) {
          console.error('Failed to parse lock file:', err);
        }
      };
      reader.readAsText(file);
    }
  }, [parseLock]);

// Force simulation step
  const simulationStep = useCallback(() => {
    if (nodes.length === 0) return;
    
    const alpha = 0.3;
    const REPULSION = 500;
    const ATTRACTION = 0.01;
    const CENTERING = 0.001;
    const DAMPING = 0.9;

    setNodes(prevNodes => {
      const newNodes = [...prevNodes];
      const n = newNodes.length;

      // Repulsion between all nodes
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = newNodes[j].x - newNodes[i].x || 0.01;
          const dy = newNodes[j].y - newNodes[i].y || 0.01;
          const dist2 = dx * dx + dy * dy;
          
          if (dist2 < 10000) {
            const force = (REPULSION / dist2) * alpha;
            const f = force / Math.sqrt(dist2);
            newNodes[i].vx -= f * dx;
            newNodes[i].vy -= f * dy;
            newNodes[j].vx += f * dx;
            newNodes[j].vy += f * dy;
          }
        }
      }

      // Attraction along edges
      for (const edge of edges) {
        const source = newNodes.find(n => n.id === edge.source);
        const target = newNodes.find(n => n.id === edge.target);
        if (!source || !target) continue;
        
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        source.vx += dx * ATTRACTION * alpha;
        source.vy += dy * ATTRACTION * alpha;
        target.vx -= dx * ATTRACTION * alpha;
        target.vy -= dy * ATTRACTION * alpha;
      }

      // Center gravity
      for (const node of newNodes) {
        node.vx += (400 - node.x) * CENTERING;
        node.vy += (300 - node.y) * CENTERING;
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
        
        // Bounds
        node.x = Math.max(20, Math.min(780, node.x));
        node.y = Math.max(20, Math.min(580, node.y));
      }

      return newNodes;
    });

    animationRef.current = requestAnimationFrame(() => simulationStepRef.current?.());
  }, [nodes, edges]);

  // Keep simulationStepRef in sync so recursive rAF can call it
  useEffect(() => {
    simulationStepRef.current = simulationStep;
  }, [simulationStep]);

  // Render canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || nodes.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x: tx, y: ty, k } = transformRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    // Draw edges
    ctx.strokeStyle = 'rgba(150, 150, 150, 0.15)';
    ctx.lineWidth = 1 / k;
    for (const edge of edges) {
      const source = nodes.find(n => n.id === edge.source);
      const target = nodes.find(n => n.id === edge.target);
      if (!source || !target) continue;
      
      if (moduleFilter && source.moduleId !== moduleFilter && target.moduleId !== moduleFilter) continue;
      
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
    }

    // Draw nodes
    for (const node of nodes) {
      if (moduleFilter && node.moduleId !== moduleFilter) continue;
      
      const isHighlighted = highlighted.has(node.id) || 
        (searchQuery && node.name.toLowerCase().includes(searchQuery.toLowerCase()));
      const opacity = isHighlighted ? 1 : (highlighted.size > 0 ? 0.3 : 0.85);
      const radius = isHighlighted ? node.radius * 1.5 : node.radius;

      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = node.color + Math.floor(opacity * 255).toString(16).padStart(2, '0');
      ctx.fill();
      
      if (isHighlighted) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2 / k;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [nodes, edges, highlighted, searchQuery, moduleFilter]);

  // Get unique modules
  const moduleIds = Array.from(new Set(nodes.map(n => n.moduleId))).sort();

  // Handle click on canvas
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - transformRef.current.x) / transformRef.current.k;
    const y = (e.clientY - rect.top - transformRef.current.y) / transformRef.current.k;
    
    for (const node of nodes) {
      const dx = x - node.x;
      const dy = y - node.y;
      if (dx * dx + dy * dy < node.radius * node.radius * 4) {
        setSelectedNode(node);
        return;
      }
    }
    setSelectedNode(null);
  }, [nodes]);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div className="w-64 border-r border-border p-4 overflow-y-auto">
        <h1 className="text-xl font-bold mb-4">Visualizer</h1>
        
        {!lock ? (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging ? 'border-primary bg-primary/10' : 'border-border'
            }`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <p className="text-muted-foreground mb-2">Drag & drop</p>
            <p className="text-xs text-muted-foreground">mikk.lock.json</p>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="mb-4 p-3 rounded-lg bg-secondary/50">
              <p className="text-sm font-medium">{stats.functions} functions</p>
              <p className="text-sm text-muted-foreground">{stats.modules} modules</p>
              <p className="text-sm text-muted-foreground">{stats.connections} connections</p>
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search functions..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full mb-3 px-3 py-2 rounded-md border border-border bg-background text-sm"
            />

            {/* Module filter */}
            <div className="mb-4">
              <p className="text-xs font-medium mb-2 text-muted-foreground">MODULES</p>
              <div className="flex flex-wrap gap-1">
                <button
                  onClick={() => setModuleFilter(null)}
                  className={`text-xs px-2 py-1 rounded ${
                    !moduleFilter ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                  }`}
                >
                  All
                </button>
                {moduleIds.slice(0, 10).map(mod => (
                  <button
                    key={mod}
                    onClick={() => setModuleFilter(mod === moduleFilter ? null : mod)}
                    className={`text-xs px-2 py-1 rounded truncate max-w-[80px] ${
                      mod === moduleFilter ? 'bg-primary text-primary-foreground' : 'bg-secondary'
                    }`}
                    style={{ color: mod === moduleFilter ? 'white' : undefined }}
                  >
                    {mod}
                  </button>
                ))}
              </div>
            </div>

            {/* Reset button */}
            <button
              onClick={() => { setLock(null); setNodes([]); setEdges([]); setSelectedNode(null); }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Upload new file
            </button>
          </>
        )}
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        {lock ? (
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            className="w-full h-full cursor-grab"
            onClick={handleCanvasClick}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>Upload mikk.lock.json to visualize</p>
          </div>
        )}

        {/* Selected node panel */}
        {selectedNode && (
          <div className="absolute top-4 right-4 w-64 p-3 rounded-lg border border-border bg-background shadow-lg">
            <p className="font-medium mb-1">{selectedNode.name}</p>
            <p className="text-xs text-muted-foreground mb-2 truncate">{getRelativePath(selectedNode.file, lock?.projectRoot)}</p>
            <div className="flex gap-1 mb-2">
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{ backgroundColor: selectedNode.color + '30', color: selectedNode.color }}
              >
                {selectedNode.moduleId}
              </span>
            </div>
            {lock?.functions?.[selectedNode.id]?.purpose && (
              <p className="text-xs">{lock.functions[selectedNode.id].purpose}</p>
            )}
            <button
              onClick={() => setSelectedNode(null)}
              className="absolute top-2 right-2 text-xs text-muted-foreground"
            >
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
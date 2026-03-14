"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { useRouter } from "next/navigation";
import { type GraphData } from "@/lib/build-graph";
import { cn } from "@/lib/utils";

export function GraphView({ graph, className }: { graph: GraphData; className?: string }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [isZoomed, setIsZoomed] = useState(false);

  const initGraph = useCallback(() => {
    if (!svgRef.current || !containerRef.current || graph.nodes.length === 0) return;

    const width = containerRef.current.clientWidth;
    const height = 450;

    const svg = d3.select(svgRef.current)
      .attr("viewBox", [0, 0, width, height])
      .attr("width", width)
      .attr("height", height)
      .style("cursor", "crosshair");

    svg.selectAll("*").remove();

    // Define gradients for nodes
    const defs = svg.append("defs");
    const gradient = defs.append("radialGradient")
      .attr("id", "node-gradient")
      .attr("cx", "50%")
      .attr("cy", "50%")
      .attr("r", "50%");
    
    gradient.append("stop")
      .attr("offset", "0%")
      .attr("stop-color", "var(--color-primary)");
    
    gradient.append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "var(--color-primary)")
      .attr("stop-opacity", 0.6);

    const g = svg.append("g");

    const simulation = d3.forceSimulation(graph.nodes as any)
      .force("link", d3.forceLink(graph.links).id((d: any) => d.id).distance(140).strength(0.1))
      .force("charge", d3.forceManyBody().strength(-250))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(50))
      .force("x", d3.forceX(width / 2).strength(0.06))
      .force("y", d3.forceY(height / 2).strength(0.06));


    const zoom = d3.zoom()
      .scaleExtent([0.3, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        setIsZoomed(event.transform.k !== 1);
      });

    svg.call(zoom as any);

    const link = g.append("g")
      .attr("stroke", "var(--color-primary)")
      .attr("stroke-opacity", 0.15)
      .attr("stroke-width", 1.5)
      .selectAll("line")
      .data(graph.links)
      .join("line");

    const node = g.append("g")
      .selectAll("g")
      .data(graph.nodes)
      .join("g")
      .attr("cursor", "pointer")
      .on("click", (event, d: any) => {
        router.push(d.url);
      })
      .call(d3.drag<any, any>()
        .on("start", (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any);

    // Node Backdrop Glow
    node.append("circle")
      .attr("r", 12)
      .attr("fill", "var(--color-primary)")
      .attr("filter", "blur(8px)")
      .attr("opacity", 0)
      .attr("class", "transition-opacity duration-300 group-hover:opacity-30");

    // Main Node
    node.append("circle")
      .attr("r", 5)
      .attr("fill", "url(#node-gradient)")
      .attr("stroke", "var(--background)")
      .attr("stroke-width", 2)
      .attr("class", "transition-all duration-300 hover:r-7");

    // Labels
    node.append("text")
      .attr("x", 12)
      .attr("y", 4)
      .text((d: any) => d.title)
      .attr("font-size", "11px")
      .attr("font-family", "var(--font-mono)")
      .attr("font-weight", "500")
      .attr("fill", "var(--color-foreground)")
      .attr("opacity", 0.4)
      .attr("class", "pointer-events-none select-none transition-opacity duration-300")
      .clone(true).lower()
      .attr("fill", "none")
      .attr("stroke", "var(--background)")
      .attr("stroke-width", 3);

    node.on("mouseenter", function() {
      d3.select(this).select("text").attr("opacity", 1);
      d3.select(this).select("circle:first-child").attr("opacity", 0.4);
    }).on("mouseleave", function() {
      d3.select(this).select("text").attr("opacity", 0.4);
      d3.select(this).select("circle:first-child").attr("opacity", 0);
    });

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => simulation.stop();
  }, [graph, router]);

  useEffect(() => {
    const cleanup = initGraph();
    return () => {
      if (cleanup) cleanup();
    };
  }, [initGraph]);


  return (
    <div 
      ref={containerRef} 
      className={cn(
        "w-full h-[450px] border border-border/10 rounded-3xl bg-primary/[0.02] overflow-hidden my-12 relative group premium-glass transition-all duration-500",
        className
      )}
    >
      <div className="absolute top-6 left-6 z-10 flex flex-col gap-1">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-primary/60 font-bold">
          Knowledge Graph
        </span>
        <span className="text-[9px] text-muted-foreground/30 font-mono">
          DRAG TO INTERACT · CLICK TO NAVIGATE
        </span>
      </div>

      <div className="absolute top-6 right-6 z-10">
        <div className={cn(
          "h-1.5 w-1.5 rounded-full bg-primary transition-all duration-500",
          isZoomed ? "scale-125 opacity-100" : "scale-100 opacity-30"
        )} />
      </div>

      <svg ref={svgRef} className="w-full h-full grayscale-[0.5] contrast-[1.1] hover:grayscale-0 transition-all duration-700" />
      
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/40 to-transparent pointer-events-none" />
      
      {/* Subtle border shine effect */}
      <div className="absolute inset-0 pointer-events-none rounded-3xl ring-1 ring-inset ring-white/5 dark:ring-white/10" />
    </div>
  );
}


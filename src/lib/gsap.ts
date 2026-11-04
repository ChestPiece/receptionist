"use client";

// One place registers GSAP plugins. Import gsap and friends from here, never from "gsap" directly.
// Lenis is the landing's one smooth-scroll engine; it is driven by the GSAP ticker in `SmoothScroll` (landing.tsx).
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";

gsap.registerPlugin(useGSAP, ScrollTrigger);
gsap.defaults({ ease: "power3.out", duration: 0.5 });

export { gsap, Lenis, ScrollTrigger, useGSAP };

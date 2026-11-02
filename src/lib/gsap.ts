"use client";

// One place registers GSAP plugins. Import gsap and friends from here, never from "gsap" directly.
// Flip and SplitText were registered here but nothing uses them (the old Flip night-shift story is gone): add them back with their first use.
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP, ScrollTrigger);
gsap.defaults({ ease: "power3.out", duration: 0.5 });

export { gsap, ScrollTrigger, useGSAP };

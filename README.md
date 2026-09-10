# Unstitch — One tile. Endless possibilities.

> **Zero-Waste Modular Textile Puzzle System & 3D Modeling Playground**  
> Naarm / Melbourne, Australia — [unstitchx.com](https://www.unstitchx.com)

---

## 🌟 Overview

**Unstitch** is a circular design studio and modular textile system. We design zero-waste, interlocking textile modules that mechanically click and fold together without sewing thread, glue, or permanent seams.

This repository contains:
1. **Interactive Web Platform**: Multi-page Astro 6 application showcasing drops, material archives, custom commissions, and workshops.
2. **3D Modeling Playground**: Parametric 3D textile simulation engine built with Three.js and React Three Fiber, allowing users to assemble, tessellate, and fold modular 3D structures in real time.
3. **Circular Textile Architecture**: Interactive rescue material archive documenting surplus and deadstock textile batches diverted from landfill.

---

## 🛠️ Tech Stack

- **Framework**: [Astro 6](https://astro.build) (SSG / Island Architecture)
- **UI & 3D Components**: [React 19](https://react.dev), [React Three Fiber](https://r3f.docs.pmnd.rs), [Three.js](https://threejs.org), [Drei](https://github.com/pmndrs/drei)
- **Styling**: Vanilla CSS Brand Design System + [Tailwind CSS v4](https://tailwindcss.com)
- **Animation & Motion**: [GSAP](https://gsap.com), [Framer Motion](https://www.framer.com/motion)
- **State Management**: [Jotai](https://jotai.org)

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+
- [pnpm](https://pnpm.io) (`npm install -g pnpm`)

### Installation
```bash
# Clone the repository
git clone https://github.com/LucidMach/Unstitch.git
cd Unstitch

# Install dependencies
pnpm install

# Start development server
pnpm dev
```
Open [http://localhost:4321](http://localhost:4321) in your browser.

### Build
```bash
# Build static production distribution
pnpm build

# Preview the production build
pnpm preview
```

---

## 🧩 3D Playground Mechanics

The 3D Playground (`/playground`) uses parametric matrix transformations to simulate physical interlocking textile tessellation:

- **Tiling Logic**:
  - Modular tiles alternate 90° rotations along the tessellation grid (`[0, +90, 0, +90, ...]`).
  - Unit nodes align tightly with adjacent keyway slots on orthogonal axes (`w`, `a`, `s`, `d`).
- **Folding & Bending Mechanics**:
  - Non-destructive rotational folding along single-connected mechanical seams.
  - Interactive angle controls, ghost node history tracking, and GLTF mesh analysis.

---

## 📄 Licensing & Intellectual Property

This repository is published under a **Split / Source-Available License** to allow community inspection while protecting proprietary commercial assets:

1. **General Website Code & UI Components**: Licensed under the **[MIT License](file:///Users/lucidmach/Unstitch/LICENSE)**.
2. **3D Modeling Playground & Geometric Folding Engine** (`src/components/playCanvas.tsx`, `src/components/scene/`, `src/hooks/use-play-canvas.ts`, `src/types/tile.ts`, `parse_glb*.js`): **Proprietary & Source-Available for Non-Commercial / Evaluation Use Only**. Commercial deployment, hosting, or embedding in commercial products without prior written authorization is strictly prohibited.
3. **Brand Assets, 3D Models & Physical Product Designs** (`public/*.glb`, `.png` renders, logos, trademarks, and physical interlocking die-cut patterns): **All Rights Reserved**.

See the full legal terms in the **[LICENSE](file:///Users/lucidmach/Unstitch/LICENSE)** file.

---

## 📬 Contact & Inquiries

- **General & Workshop Enquiries**: [unstitchxfactory@gmail.com](mailto:unstitchxfactory@gmail.com)
- **Commercial Licensing & Partnerships**: [unstitchxfactory@gmail.com](mailto:unstitchxfactory@gmail.com)
- **Website**: [https://www.unstitchx.com](https://www.unstitchx.com)
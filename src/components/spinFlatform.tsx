/**
 * Copyright (c) 2025–2026 Unstitch. All rights reserved.
 *
 * This file is part of the Unstitch 3D Parametric Modeling Engine.
 * Use of this source code is governed by the Non-Commercial and
 * Evaluation License terms defined in the LICENSE file at the root
 * of this repository. Commercial use or redistribution is prohibited.
 */

import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, type JSX } from "react";
import { Mesh } from "three";

interface props {
  Model: React.ComponentType<any>;
}

const RotatingTile: React.FC<props> = ({ Model }) => {
  const tile = useRef<Mesh>(null);

  useFrame(() => {
    if (tile.current) tile.current.rotation.z += 0.01;
  });

  return <Model ref={tile} position={[0, 0, 0]} />;
};

const SpinFlatform: React.FC<props> = ({ Model }) => {
  return (
    <div>
      <Canvas
        style={{
          position: "fixed",
          top: 0,
          left: 0,
        }}
        camera={{ position: [0, -150, 0] }}
      >
        <RotatingTile Model={Model} />
      </Canvas>
    </div>
  );
};

export default SpinFlatform;

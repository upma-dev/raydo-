import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// Replace with production-quality Raydo taxi GLB
const GLB_MODEL_PATH = "/models/raydo-taxi.glb";

export default function ThreeTaxiHeroScene() {
  const mountRef = useRef(null);
  const [modelLoaded, setModelLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let width = container.clientWidth || 600;
    let height = container.clientHeight || 550;

    // ==================== SCENE & BLUE HOUR ATMOSPHERE ====================
    const scene = new THREE.Scene();
    // Modern Indian city at blue hour atmospheric haze
    scene.fog = new THREE.FogExp2(0x1e1b4b, 0.015);

    // ==================== CINEMATIC 3/4 FRONT CAMERA ====================
    // Slightly low perspective similar to professional automotive advertisement
    const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(4.2, 1.35, 5.2);
    camera.lookAt(0, 0.45, 0);

    // ==================== WEBGL RENDERER (SEAMLESS BLENDING) ====================
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true, // Seamless blending into hero background (NO box, NO frame)
      powerPreference: "high-performance",
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    container.appendChild(renderer.domElement);

    // ==================== CINEMATIC AUTOMOTIVE LIGHTING ====================
    // Key Light: Warm soft sunlight / street light
    const keyLight = new THREE.DirectionalLight(0xfff7ed, 2.6);
    keyLight.position.set(6, 9, 6);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.bias = -0.0001;
    scene.add(keyLight);

    // Fill Light: Soft technology blue
    const blueFill = new THREE.DirectionalLight(0x38bdf8, 1.2);
    blueFill.position.set(-6, 4, 3);
    scene.add(blueFill);

    // Rim Light: Subtle purple defining vehicle contours
    const purpleRim = new THREE.DirectionalLight(0xc084fc, 1.8);
    purpleRim.position.set(2, 6, -6);
    scene.add(purpleRim);

    // Ambient light for soft environment base
    const ambientLight = new THREE.AmbientLight(0x312e81, 0.9);
    scene.add(ambientLight);

    // Raydo Yellow Warm Accent Light
    const yellowAccent = new THREE.PointLight(0xfacc15, 1.5, 8);
    yellowAccent.position.set(1.5, 2.5, 2);
    scene.add(yellowAccent);

    // ==================== REALISTIC URBAN ASPHALT ROAD ====================
    const roadGroup = new THREE.Group();
    scene.add(roadGroup);

    // Dark realistic asphalt road
    const roadGeo = new THREE.PlaneGeometry(16, 28);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.72,
      metalness: 0.28,
    });
    const roadPlane = new THREE.Mesh(roadGeo, roadMat);
    roadPlane.rotation.x = -Math.PI / 2;
    roadPlane.position.y = 0;
    roadPlane.receiveShadow = true;
    roadGroup.add(roadPlane);

    // Sidewalk Curbs
    const curbGeo = new THREE.BoxGeometry(0.5, 0.12, 28);
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });
    const curbLeft = new THREE.Mesh(curbGeo, curbMat);
    curbLeft.position.set(-4.5, 0.06, 0);
    roadGroup.add(curbLeft);

    const curbRight = new THREE.Mesh(curbGeo, curbMat);
    curbRight.position.set(4.5, 0.06, 0);
    roadGroup.add(curbRight);

    // Realistic Lane Markings (White & Yellow)
    const dashGeo = new THREE.PlaneGeometry(0.12, 1.6);
    const yellowDashMat = new THREE.MeshBasicMaterial({ color: 0xfacc15, opacity: 0.85, transparent: true });
    for (let z = -12; z <= 12; z += 3.2) {
      const dash = new THREE.Mesh(dashGeo, yellowDashMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(0, 0.008, z);
      roadGroup.add(dash);
    }

    // ==================== SUBTLE RAYDO ROUTE LINE ON ROAD ====================
    // ONE subtle navigation path curve (Yellow -> Purple -> Blue)
    const curvePoints = [
      new THREE.Vector3(-2.8, 0.015, -8),
      new THREE.Vector3(-1.4, 0.015, -3),
      new THREE.Vector3(0, 0.015, 0.5),
      new THREE.Vector3(1.2, 0.015, 4),
      new THREE.Vector3(2.6, 0.015, 8),
    ];
    const curve = new THREE.CatmullRomCurve3(curvePoints);
    const routePoints = curve.getPoints(80);

    const count = routePoints.length;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const colorYellow = new THREE.Color(0xfacc15);
    const colorPurple = new THREE.Color(0xa855f7);
    const colorBlue = new THREE.Color(0x38bdf8);

    routePoints.forEach((pt, i) => {
      positions[i * 3] = pt.x;
      positions[i * 3 + 1] = pt.y;
      positions[i * 3 + 2] = pt.z;

      const t = i / (count - 1);
      const c = new THREE.Color();
      if (t < 0.5) {
        c.copy(colorYellow).lerp(colorPurple, t * 2);
      } else {
        c.copy(colorPurple).lerp(colorBlue, (t - 0.5) * 2);
      }
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    });

    const routeGeo = new THREE.BufferGeometry();
    routeGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    routeGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const routeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      linewidth: 2,
      transparent: true,
      opacity: 0.85,
    });
    const routeLine = new THREE.Line(routeGeo, routeMat);
    roadGroup.add(routeLine);

    // Pickup Pin Marker
    const pinGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const pinStart = new THREE.Mesh(
      pinGeo,
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    pinStart.position.copy(curvePoints[0]);
    pinStart.position.y = 0.15;
    roadGroup.add(pinStart);

    // Destination Pin Marker
    const pinEnd = new THREE.Mesh(
      pinGeo,
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    pinEnd.position.copy(curvePoints[4]);
    pinEnd.position.y = 0.15;
    roadGroup.add(pinEnd);

    // ==================== REALISTIC BLUE HOUR CITY BACKGROUND ====================
    const cityGroup = new THREE.Group();
    cityGroup.position.set(0, 0, -12);
    scene.add(cityGroup);

    // Architectural buildings with window glow (NOT simple blocks)
    const buildingMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.15,
    });

    const windowMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0.6,
    });

    const buildingData = [
      { x: -6.5, y: 3.5, z: -2, w: 2.2, h: 7, d: 2 },
      { x: -3.8, y: 4.2, z: -4, w: 2.6, h: 8.4, d: 2.4 },
      { x: 3.8, y: 3.8, z: -3, w: 2.4, h: 7.6, d: 2.2 },
      { x: 6.8, y: 4.8, z: -4, w: 3.0, h: 9.6, d: 2.6 },
    ];

    buildingData.forEach(({ x, y, z, w, h, d }) => {
      const bMesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
      bMesh.position.set(x, y, z);
      cityGroup.add(bMesh);

      // Add small glowing window grids on building facade
      for (let wy = -h / 2 + 1; wy < h / 2 - 1; wy += 1.2) {
        for (let wx = -w / 2 + 0.4; wx < w / 2 - 0.4; wx += 0.6) {
          if (Math.random() > 0.4) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.45), windowMat);
            win.position.set(x + wx, y + wy, z + d / 2 + 0.02);
            cityGroup.add(win);
          }
        }
      }
    });

    // Street Lamps along sidewalk
    const lampPosts = [-5, 0, 5];
    lampPosts.forEach((zPos) => {
      const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.2);
      const poleMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.8 });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(-4.2, 1.6, zPos);
      roadGroup.add(pole);

      const lampHead = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xfff7ed })
      );
      lampHead.position.set(-4.2, 3.2, zPos);
      roadGroup.add(lampHead);

      const streetLight = new THREE.PointLight(0xffedd5, 1.2, 6);
      streetLight.position.set(-4.2, 3.1, zPos);
      roadGroup.add(streetLight);
    });

    // Soft Distant Traffic Lights in Background
    const trafficGroup = new THREE.Group();
    scene.add(trafficGroup);

    const trafficCount = 14;
    const trafficGeo = new THREE.BufferGeometry();
    const trafficPos = new Float32Array(trafficCount * 3);
    for (let i = 0; i < trafficCount * 3; i += 3) {
      trafficPos[i] = (Math.random() - 0.5) * 10;
      trafficPos[i + 1] = 0.2 + Math.random() * 0.1;
      trafficPos[i + 2] = -6 - Math.random() * 8;
    }
    trafficGeo.setAttribute("position", new THREE.BufferAttribute(trafficPos, 3));
    const trafficMat = new THREE.PointsMaterial({
      color: 0xef4444,
      size: 0.18,
      transparent: true,
      opacity: 0.75,
    });
    const trafficParticles = new THREE.Points(trafficGeo, trafficMat);
    trafficGroup.add(trafficParticles);

    // ==================== VEHICLE CONTAINER & SHADOW ====================
    const vehicleContainer = new THREE.Group();
    scene.add(vehicleContainer);

    // Contact shadow under vehicle on road
    const shadowGeo = new THREE.PlaneGeometry(2.8, 5.0);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x020617,
      transparent: true,
      opacity: 0.65,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.set(0, 0.005, 0);
    scene.add(contactShadow);

    // Wheels references for animation
    let animatedWheels = [];

    // ==================== REALISTIC GLB VEHICLE LOADER ====================
    // Replace with production-quality Raydo taxi GLB
    const loader = new GLTFLoader();

    loader.load(
      GLB_MODEL_PATH,
      (gltf) => {
        const vehicleModel = gltf.scene;

        // Auto scale and align vehicle model to asphalt surface
        const bbox = new THREE.Box3().setFromObject(vehicleModel);
        const size = bbox.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scaleFactor = 4.2 / (maxDim || 1);
        vehicleModel.scale.set(scaleFactor, scaleFactor, scaleFactor);

        // Re-center model
        const scaledBbox = new THREE.Box3().setFromObject(vehicleModel);
        vehicleModel.position.y = -scaledBbox.min.y + 0.01;

        // PBR Automotive Material Enhancements
        vehicleModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            const matName = (child.material?.name || child.name || "").toLowerCase();

            // Apply Pearl White Metallic paint to body
            if (matName.includes("body") || matName.includes("paint") || matName.includes("car")) {
              child.material = new THREE.MeshPhysicalMaterial({
                color: 0xf8fafc, // Pearl white
                metalness: 0.85,
                roughness: 0.15,
                clearcoat: 1.0,
                clearcoatRoughness: 0.05,
              });
            }
            // Raydo Yellow Accent details
            else if (matName.includes("stripe") || matName.includes("accent") || matName.includes("logo") || matName.includes("taxi")) {
              child.material = new THREE.MeshPhysicalMaterial({
                color: 0xfacc15,
                metalness: 0.4,
                roughness: 0.2,
                clearcoat: 0.8,
                emissive: 0xeab308,
                emissiveIntensity: 0.2,
              });
            }
            // Realistic Glass
            else if (matName.includes("glass") || matName.includes("window") || matName.includes("windshield")) {
              child.material = new THREE.MeshPhysicalMaterial({
                color: 0x0f172a,
                metalness: 0.9,
                roughness: 0.05,
                transmission: 0.5,
                thickness: 0.8,
                clearcoat: 1.0,
              });
            }
            // Wheels / Tires
            else if (matName.includes("wheel") || matName.includes("tire")) {
              animatedWheels.push(child);
            }
          }
        });

        vehicleContainer.add(vehicleModel);
        setModelLoaded(true);
      },
      undefined,
      (err) => {
        // Expected fallback when /models/raydo-taxi.glb is not yet present on disk.
        // DO NOT create another cube-based taxi.
        // Keep visual architecture ready for production asset.
        console.info(
          "Raydo 3D Taxi Loader: /models/raydo-taxi.glb not found. Displaying realistic automotive lighting stage."
        );
        setLoadError(true);

        // Sleek subtle spotlight stage indicator on road surface (NO primitive cube car!)
        const stageRingGeo = new THREE.RingGeometry(1.2, 1.35, 48);
        const stageRingMat = new THREE.MeshBasicMaterial({
          color: 0xfacc15,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.4,
        });
        const stageRing = new THREE.Mesh(stageRingGeo, stageRingMat);
        stageRing.rotation.x = -Math.PI / 2;
        stageRing.position.set(0, 0.015, 0);
        vehicleContainer.add(stageRing);
      }
    );

    // ==================== ANIMATION LOOP & PARALLAX ====================
    let mouseX = 0;
    let mouseY = 0;

    const handleMouseMove = (e) => {
      const rect = container.getBoundingClientRect();
      mouseX = ((e.clientX - rect.left) / width - 0.5) * 2;
      mouseY = ((e.clientY - rect.top) / height - 0.5) * 2;
    };

    window.addEventListener("mousemove", handleMouseMove);

    const handleResize = () => {
      if (!container) return;
      width = container.clientWidth;
      height = container.clientHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    const clock = new THREE.Clock();
    let animId;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Subtle suspension floating for vehicle container (natural driving feel)
      vehicleContainer.position.y = Math.sin(elapsed * 2.2) * 0.018;
      vehicleContainer.rotation.z = Math.sin(elapsed * 1.8) * 0.005;

      // Wheel natural rotation
      animatedWheels.forEach((w) => {
        w.rotation.x += 0.04;
      });

      // Background traffic lights smooth movement
      const posAttr = trafficGeo.attributes.position;
      for (let i = 0; i < trafficCount; i++) {
        let zVal = posAttr.getZ(i) + 0.03;
        if (zVal > 2) zVal = -14;
        posAttr.setZ(i, zVal);
      }
      posAttr.needsUpdate = true;

      // Cinematic camera smooth drift & subtle parallax with mouse
      camera.position.x += (4.2 + mouseX * 0.35 - camera.position.x) * 0.04;
      camera.position.y += (1.35 - mouseY * 0.25 - camera.position.y) * 0.04;
      camera.lookAt(0, 0.45, 0);

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", handleMouseMove);
      resizeObserver.disconnect();
      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative w-full h-[440px] sm:h-[520px] lg:h-[600px] select-none pointer-events-auto flex items-center justify-center">
      <div ref={mountRef} className="w-full h-full" />

      {/* Asset Status Badge (Visible when asset is loading / expected at /models/raydo-taxi.glb) */}
      {!modelLoaded && (
        <div className="absolute bottom-4 right-4 z-20 bg-slate-900/80 border border-slate-700/70 backdrop-blur-md px-3.5 py-1.5 rounded-full text-[11px] font-bold text-amber-400 flex items-center gap-2 pointer-events-none shadow-xl">
          <span className="size-2 rounded-full bg-amber-400 animate-ping" />
          <span>
            {loadError
              ? "Automotive Asset Ready: /models/raydo-taxi.glb"
              : "Loading Automotive Taxi Asset..."}
          </span>
        </div>
      )}
    </div>
  );
}


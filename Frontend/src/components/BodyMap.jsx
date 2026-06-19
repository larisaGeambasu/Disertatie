import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

const BODY_ZONES = [
  {
    id: 'head',
    label: 'Cap',
    hint:
      'Ai selectat capul. Urmareste schimbari de comportament, sensibilitate la atingere sau miscari neobisnuite.'
  },
  {
    id: 'eyes',
    label: 'Ochi',
    hint:
      'Pentru ochi, urmareste roseata, secretii, clipit des sau sensibilitate la lumina.'
  },
  {
    id: 'ears',
    label: 'Urechi',
    hint:
      'Pentru urechi, urmareste scarpinat frecvent, miros neplacut, roseata sau sensibilitate la atingere.'
  },
  {
    id: 'mouth',
    label: 'Gura / dinti',
    hint:
      'Pentru gura si dinti, urmareste salivare excesiva, miros neplacut, dificultate la mancat sau gingii iritate.'
  },
  {
    id: 'coat',
    label: 'Piele / blana',
    hint:
      'Pentru piele si blana, verifica mancarime, cadere de par, iritatii, rani sau zone sensibile.'
  },
  {
    id: 'abdomen',
    label: 'Abdomen',
    hint:
      'Ai selectat abdomenul. Poti urmari balonare, sensibilitate, varsaturi, diaree, constipatie sau lipsa apetitului.'
  },
  {
    id: 'joints',
    label: 'Articulatii',
    hint:
      'Pentru articulatii, urmareste rigiditatea, schiopatatul, evitarea sariturilor sau durerea la miscare.'
  },
  {
    id: 'paws',
    label: 'Labute',
    hint:
      'Pentru labute, verifica mersul, pernutele, unghiile si daca animalul evita sa calce normal.'
  },
  {
    id: 'tail',
    label: 'Coada',
    hint:
      'Pentru coada, urmareste pozitia, sensibilitatea la atingere si orice miscare neobisnuita.'
  }
]

const MODEL_CONFIG = {
  pisica: {
    path: '/models/cat/',
    file: 'lowpoly-cat.obj',
    label: 'pisica',
    scale: 38.5,
    rotation: [0, -0.1, 0],
    positionY: -0.2,
    floorY: -1.15,
    camera: [0, 0.65, 6.2],
    material: 0x46526b
  },
  caine: {
    path: '/models/dog/',
    file: 'dog.obj',
    label: 'caine',
    scale: 38.5,
    rotation: [-Math.PI / 2, 0, -Math.PI / 2],
    positionY: 0.06,
    floorY: -1.75,
    camera: [0, 0.85, 6.75],
    material: 0x4a5368
  }
}

function AnimalModelCanvas({ species = 'pisica', compact = false }) {
  const mountRef = useRef(null)
  const [status, setStatus] = useState('loading')
  const config = MODEL_CONFIG[species] || MODEL_CONFIG.pisica

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return undefined
    setStatus('loading')

    const scene = new THREE.Scene()
    scene.background = null

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    mount.appendChild(renderer.domElement)

    const camera = new THREE.PerspectiveCamera(compact ? 42 : 36, 1, 0.1, 100)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.enablePan = false
    controls.autoRotate = true
    controls.autoRotateSpeed = 0.6

    const getLayoutSettings = () => {
      const width = mount.clientWidth || 560
      const height = mount.clientHeight || 360
      const shouldCompact = compact || width < 440 || height < 340

      return {
        width,
        height,
        shouldCompact,
        scaleFactor: shouldCompact ? 0.22 : 1,
        cameraZFactor: shouldCompact ? 2.85 : 1,
        cameraYFactor: shouldCompact ? 0.86 : 1,
        floorScale: shouldCompact ? 0.42 : 1,
        positionYOffset: shouldCompact ? -0.12 : 0
      }
    }

    const applyCameraLayout = () => {
      const settings = getLayoutSettings()

      camera.fov = settings.shouldCompact ? 42 : 36
      camera.position.set(
        config.camera[0],
        config.camera[1] * settings.cameraYFactor,
        config.camera[2] * settings.cameraZFactor
      )
      camera.aspect = settings.width / settings.height
      camera.updateProjectionMatrix()

      controls.minDistance = settings.shouldCompact ? 7.5 : 3
      controls.maxDistance = settings.shouldCompact ? 15 : 7.5
      controls.target.set(0, settings.shouldCompact ? -0.08 : 0, 0)
      controls.update()
    }

    applyCameraLayout()

    scene.add(new THREE.HemisphereLight(0xffffff, 0xa8b5d9, 2.9))
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.4)
    keyLight.position.set(4, 5, 5)
    scene.add(keyLight)
    const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.2)
    fillLight.position.set(-5, 2, 3)
    scene.add(fillLight)
    const rimLight = new THREE.DirectionalLight(0x7c3aed, 0.85)
    rimLight.position.set(-3, 4, -5)
    scene.add(rimLight)

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.7, 64),
      new THREE.MeshBasicMaterial({
        color: 0xdff5f1,
        transparent: true,
        opacity: 0.32,
        depthWrite: false
      })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = config.floorY
    scene.add(floor)

    let model = null
    let frameId = 0

    const applyObjectLayout = () => {
      const settings = getLayoutSettings()

      if (model) {
        const baseScale = model.userData.baseScale || 1
        model.scale.setScalar(baseScale * settings.scaleFactor)
        model.position.y = config.positionY + settings.positionYOffset
      }

      floor.scale.setScalar(settings.floorScale)
      floor.position.y = config.floorY * (settings.shouldCompact ? 0.74 : 1)
    }

    const resize = () => {
      const settings = getLayoutSettings()
      renderer.setSize(settings.width, settings.height)
      applyCameraLayout()
      applyObjectLayout()
    }

    const normalizeModel = (object) => {
      const box = new THREE.Box3().setFromObject(object)
      const size = new THREE.Vector3()
      const center = new THREE.Vector3()
      box.getSize(size)
      box.getCenter(center)

      const maxAxis = Math.max(size.x, size.y, size.z) || 1
      object.position.set(-center.x, -center.y, -center.z)

      const group = new THREE.Group()
      group.add(object)
      group.userData.baseScale = config.scale / maxAxis
      group.scale.setScalar(group.userData.baseScale)
      group.rotation.set(...config.rotation)
      group.position.y = config.positionY

      return group
    }

    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: config.material,
      roughness: 0.72,
      metalness: 0.06,
      flatShading: true
    })
    const edgeMaterial = new THREE.LineBasicMaterial({
      color: 0xc4d7ff,
      transparent: true,
      opacity: 0.18
    })
    const objectLoader = new OBJLoader()
    objectLoader.setPath(config.path)
    objectLoader.load(
      config.file,
      (object) => {
        object.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true
            child.receiveShadow = true
            child.material = bodyMaterial

            const edges = new THREE.LineSegments(
              new THREE.EdgesGeometry(child.geometry, 38),
              edgeMaterial
            )
            edges.renderOrder = 2
            child.add(edges)
          }
        })
        model = normalizeModel(object)
        scene.add(model)
        applyObjectLayout()
        setStatus('ready')
      },
      undefined,
      () => setStatus('error')
    )

    const animate = () => {
      frameId = requestAnimationFrame(animate)
      if (model) {
        const settings = getLayoutSettings()
        model.position.y =
          config.positionY +
          settings.positionYOffset +
          Math.sin(Date.now() * 0.0014) * 0.018
      }
      controls.update()
      renderer.render(scene, camera)
    }

    resize()
    animate()
    window.addEventListener('resize', resize)

    return () => {
      window.removeEventListener('resize', resize)
      cancelAnimationFrame(frameId)
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement)
      }
    }
  }, [config, compact])

  return (
    <div className="body-map-3d-canvas" ref={mountRef}>
      {status === 'loading' && (
        <span className="body-map-loading">Se incarca modelul 3D pentru {config.label}...</span>
      )}
      {status === 'error' && (
        <span className="body-map-loading error">Modelul 3D nu a putut fi incarcat.</span>
      )}
    </div>
  )
}

function BodyMap({ species = 'pisica', value = 'abdomen', onChange, compact = false }) {
  const normalizedSpecies = species === 'caine' ? 'caine' : 'pisica'
  const [internalZone, setInternalZone] = useState(value || 'abdomen')
  const selectedZone = value || internalZone
  const zoneInfo = useMemo(
    () => BODY_ZONES.find((zone) => zone.id === selectedZone) || BODY_ZONES[0],
    [selectedZone]
  )

  const selectZone = (zoneId) => {
    setInternalZone(zoneId)
    onChange?.(zoneId)
  }

  return (
    <div className={`body-map-preview body-map-premium body-map-modern ${compact ? 'body-map-compact' : ''}`}>
      <div className="body-map-stage body-map-3d-stage">
        <div className="body-map-orbit-hint">
          roteste modelul
        </div>

        <AnimalModelCanvas species={normalizedSpecies} compact={compact} />
      </div>

      <div className="body-map-info">
        <span>Harta interactiva</span>
        <strong>Harta corporala</strong>
        <p>
          Alege zona unde ai observat schimbari. Modelul poate fi rotit, iar zona
          selectata te ajuta sa notezi simptomele mai precis.
        </p>

        <div className="selected-zone-card">
          <span>Zona selectata</span>
          <strong>{zoneInfo.label}</strong>
          <p>{zoneInfo.hint}</p>
        </div>

        <div className="body-zone-list body-zone-buttons">
          {BODY_ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              className={selectedZone === zone.id ? 'active' : ''}
              onClick={() => selectZone(zone.id)}
            >
              {zone.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default BodyMap

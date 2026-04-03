# Newton's Eye

Core architecture for high-fidelity physics reverse-engineering:

- `backend/app/models/motion.py`: shared SI-aligned backend contract and API payloads.
- `backend/app/services/physics_solver.py`: spline smoothing, initial-state inference, and RK4 projectile simulation with quadratic drag.
- `backend/app/main.py`: FastAPI entrypoint exposing `POST /api/simulate`.
- `frontend/src/types/physics.ts`: mirrored TypeScript contract.
- `frontend/src/stores/usePhysicsStore.ts`: Zustand store coordinating the client simulation flow.

# Vitruvian Training Modes

The Vitruvian Trainer utilizes dynamic, software-controlled motor resistance to simulate a variety of training modalities. The following modes are supported by the Vitruvian hardware protocol and synchronized with Project Phoenix mobile and portal databases.

## 1. Old School (`OLD_SCHOOL`)
- **Description**: Constant resistance throughout the entire range of motion (concentric and eccentric).
- **Behavior**: Mimics traditional free weights. The tension remains uniform regardless of velocity or directional phase, though digital slack is managed smoothly at the ends of the range.
- **Best For**: General strength training, hyper-focused movement paths, and classic barbell/dumbbell equivalent exercises.

## 2. Time Under Tension (`TUT`)
- **Description**: Constant tension where the machine actively resists the concentric phase and applies a smooth, slower load during the eccentric (lowering) phase.
- **Behavior**: Extends the muscle's state of loaded tension. If the user moves too quickly, the resistance dynamically adjusts to keep the speed controlled.
- **Best For**: Stimulating hypertrophy, improving tendon stiffness, and targeting motor units through prolonged muscle loading.

## 3. TUT Beast (`TUT_BEAST`)
- **Description**: An aggressive high-tension variation of Time Under Tension.
- **Behavior**: Fast ramp-up of tension. Delivers peak eccentric overload with very aggressive load curves, requiring the user to struggle actively against high forces in the eccentric portion.
- **Best For**: Advanced power lifters, elite strength athletes, and eccentric overload adaptation.

## 4. Pump (`PUMP`)
- **Description**: Velocity-dependent dynamic variable resistance.
- **Behavior**: The resistance scales with the user's velocity. The faster you push or pull, the heavier the resistance becomes. If the user slows down, the load decreases, allowing accommodating resistance that avoids premature sticking-point fatigue.
- **Best For**: Explosive concentric work, power development, metabolic stress, and high-volume pump sessions.

## 5. Eccentric Only (`ECCENTRIC_ONLY`)
- **Description**: Load is applied exclusively during the eccentric (lowering) phase.
- **Behavior**: The concentric phase is completely unloaded or has a minimal 8 lb tracking tension. Once the concentric peak is reached, the preset target weight immediately engages for the eccentric return phase.
- **Best For**: Rehabilitative training, breaking through strength plateaus, and maximizing mechanical muscle damage with minimal metabolic fatigue.

## 6. Echo (`ECHO`)
- **Description**: Isokinetic-like velocity-locked mode.
- **Behavior**: Locks the speed of movement. No matter how much force the user exerts, they cannot exceed the locked velocity. The machine matches the user's force output 1:1.
- **Best For**: Maximum strength assessments, rehabilitation, and safe peak torque tracking.

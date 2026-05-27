# Strength Assessments & Weight Limits

To ensure safe operation and optimal training efficacy, the Vitruvian hardware and Project Phoenix software enforce strict weight limits and strength assessment guidelines.

## Weight Limits & Cable Conventions

### Digital Weight Boundaries
- **Minimum Tension**: The Vitruvian physical motor requires a minimum constant tracking tension of **8 lbs (approx. 3.6 kg) per cable**. It cannot generate active loads below this baseline.
- **Maximum Load**: The machine supports a maximum load of **220 kg (approx. 485 lbs) per cable**.

### Database vs. Display Weight Convention
- **Database Storage (Source of Truth)**: All weight values in the local SQLite database and remote Supabase tables are stored strictly **per-cable** (0 to 220 kg range).
- **User Display Multiplier**: To align with human barbell/dumbbell expectations, the phoenix-portal and mobile app UI multiply the database per-cable weight by **2** (`WEIGHT_MULTIPLIER = 2`) for total display weight. 
- *Example*: A stored value of `50 kg` is presented to the user in their logs as `100 kg` (representing the combined effort of both cables).

## Strength Assessments (Calibration)

Before users can engage in high-intensity training modes (like `TUT_BEAST` or `ECCENTRIC_ONLY`), they must complete a calibration strength assessment.

1. **Protocol**: The user performs 3 sub-maximal reps followed by 1-2 maximum-effort reps under an accommodating resistance curve (`ECHO` or `PUMP` mode).
2. **Safety Ceiling**: The peak concentric and eccentric force measured during the assessment establishes the user's initial **Strength Ceiling**.
3. **Weight Caps**: High-intensity workouts are capped at **90% of the assessed Strength Ceiling** for safety. Users cannot configure weights higher than their ceiling without performing a new assessment.

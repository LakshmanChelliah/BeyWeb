/** Shared game constants */
export const CONFIG = Object.freeze({
  ARENA_RADIUS: 14.0,
  WALL_RADIUS: 13.55,
  /** Marble platform + white barrier ring (see render/arena.js). */
  PLATFORM_OUTER_RADIUS: 18.0,
  POCKET_EXIT_RADIUS: 14.05,
  POCKET_HALF_WIDTH: Math.PI / 7.5,
  POCKET_ANGLES: [0, (2 * Math.PI) / 3, (4 * Math.PI) / 3],
  /** Libra buster center pull — keep in sync with physics/top.js center pull scaling. */
  SONIC_QUICKSAND_PULL_MULT: 3.4,

  TOP_HEIGHT: 0.9,
  TOP_MASS: 2.5,
  DEFAULT_OUTER_RADIUS: 1.05,
  // Collider radius = model bounding-box half-width * this. The GLB box is
  // looser than the visible metal wheel, so < 1 pulls the collision edge in to
  // where the discs actually meet. Toggle the KeyC debug ring to recalibrate.
  COLLIDER_INSET: 0.9,

  MAX_SPIN: 82,
  SPIN_DECAY: 0.038,
  STABLE_SPIN: 0.1,
  SLEEP_THRESHOLD: 0.02,
  /** Spin gauge must reach this before sleep-out can register. */
  SPIN_STOPPED: 0.001,
  /** Wobble only begins once spin falls below this (12%). */
  WOBBLE_SPIN_START: 0.12,
  /** Visual spin stays at full speed until the gauge drops below this. */
  VISUAL_SPIN_SLOW_START: 0.6,
  /** Seconds for wobble + tip-over after 0% spin. */
  DEATH_ANIM_DUR: 1.0,
  /** Seconds of no spin (still) after death anim before sleep-out. */
  SLEEP_OUT_DELAY: 1.0,

  STEER_FORCE: 62,
  GYRO_FORCE: 62,
  GYRO_CLAMP: 35,
  AI_FORCE: 46,
  CENTER_PULL_FORCE: 20,
  SPAWN_OFFSET: 5.0,
  /** Seconds of collision-free intro at round start (drop-in launch). */
  LAUNCH_GRACE: 1.0,
  /** Height above the floor where beys appear before dropping in. */
  LAUNCH_DROP_HEIGHT: 3.0,
  /** Initial inward speed toward arena center during launch intro. */
  LAUNCH_INWARD_SPEED: 6.0,

  COLLISION_BOWL: 1,
  COLLISION_PLAYER: 2,
  COLLISION_AI: 4,

  KNOCKBACK_SCALE: 2.2,
  MIN_KNOCKBACK: 3.0,
  SPIN_LOSS_SCALE: 0.011,
  MIN_SPIN_LOSS: 0.003,
  MAX_SPIN_LOSS: 0.11,
  IMPACT_COOLDOWN: 0.08,
  /** Spin lost when a bey hits the rim wall (3–7% scaled by impact speed). */
  WALL_SPIN_LOSS_MIN: 0.03,
  WALL_SPIN_LOSS_MAX: 0.07,
  WALL_IMPACT_SOFT: 3.0,
  WALL_IMPACT_HARD: 20.0,
  WALL_IMPACT_COOLDOWN: 0.08,

  COLLISION_SPARK_BASELINE_SPEED: 9,
  COLLISION_SPARK_LIFE: 0.28,
  COLLISION_SPARK_COUNT_MIN: 22,
  COLLISION_SPARK_COUNT_MAX: 40,
  COLLISION_SPARK_SPECIAL_SCALE: 1.55,
  COLLISION_SPARK_SPECIAL_COUNT_BONUS: 10,
  /** Seconds between spark bursts while beys stay in contact (grind / wall slide). */
  COLLISION_SPARK_SUSTAIN_INTERVAL: 0.035,
  /** Particle count multiplier for sustained-contact sparks vs impact bursts. */
  COLLISION_SPARK_SUSTAIN_SCALE: 0.38,

  LINEAR_DAMPING: 0.20,

  FIXED_DT: 1 / 60,
  FLOOR_Y: 0,
  WALL_HEIGHT: 1.85,
  WALL_SEGMENT_THICKNESS: 0.32,
  WALL_SEGMENTS_PER_ARC: 7,

  GRAVITY: 14,
  FLOOR_EPSILON: 0.02,

  /** KO cinematic — slide off the stadium; boost exit speed without an upward pop. */
  RING_OUT_MIN_SPEED: 7,
  RING_OUT_SPEED_MULT: 1.12,
  /** Y below this after leaving the platform edge ends the KO sequence. */
  PLATFORM_FALL_Y: -2.5,
  RING_OUT_MAX_DUR: 4.5,

  /** TEMP: set false before release — skips charge, cooldown, and special windup. */
  ABILITY_TEST_NO_DELAYS: false,
});

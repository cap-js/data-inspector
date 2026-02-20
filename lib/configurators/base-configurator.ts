/**
 * Base class for all configurators.
 * Each configurator handles a specific integration (Portal Service, Work Zone, etc.)
 */
export abstract class BaseConfigurator {
  /**
   * Human-readable name for logging
   */
  abstract get name(): string;

  /**
   * Check if this configurator should run based on host project configuration.
   * Returns true if the host project uses the service/feature this configurator handles.
   */
  abstract canRun(): Promise<boolean>;

  /**
   * Apply the configuration to the host project.
   * This is called only if canRun() returns true.
   */
  abstract run(): Promise<void>;
}

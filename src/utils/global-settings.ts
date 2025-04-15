/**
 * Global Settings Utility
 * ======================
 * 
 * Provides global settings for the Git MCP server, including security configurations.
 * These settings can be used across different tools and services.
 */

import path from 'path';

/**
 * Global settings singleton for storing app-wide configuration
 */
export class GlobalSettings {
  private static instance: GlobalSettings;
  private _globalWorkingDir: string | null = null;
  private _allowedBaseDir: string;

  /**
   * Private constructor to enforce singleton pattern and validate required settings
   */
  private constructor() {
    // Validate and set the allowed base directory from environment variable
    const baseDir = process.env.GIT_MCP_BASE_DIR;
    if (!baseDir) {
      throw new Error('FATAL: GIT_MCP_BASE_DIR environment variable is not set. Server cannot operate securely without a defined base directory.');
    }
    // Normalize the base directory path
    this._allowedBaseDir = path.resolve(baseDir); 
    console.error(`[GlobalSettings] Allowed base directory set to: ${this._allowedBaseDir}`);
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): GlobalSettings {
    if (!GlobalSettings.instance) {
      GlobalSettings.instance = new GlobalSettings();
    }
    return GlobalSettings.instance;
  }

  /**
   * Get the global working directory if set
   */
  public get globalWorkingDir(): string | null {
    return this._globalWorkingDir;
  }
  
  /**
   * Get the allowed base directory for sandboxing repository access
   */
  public get allowedBaseDir(): string {
    return this._allowedBaseDir;
  }

  /**
   * Set the global working directory
   * 
   * @param path - Path to use as global working directory
   */
  public setGlobalWorkingDir(path: string | null): void {
    this._globalWorkingDir = path;
  }
}

/**
 * Helper function to get global settings instance
 */
export function getGlobalSettings(): GlobalSettings {
  return GlobalSettings.getInstance();
}

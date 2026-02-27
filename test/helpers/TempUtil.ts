/**
 * Utility for creating and managing temporary test folders
 */
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { join } from "path";

export class TempUtil {
  private rootTempFolder: string;

  constructor() {
    const random = crypto.randomBytes(2).toString("hex");
    this.rootTempFolder = join(os.tmpdir(), `${random}.tmp`);
  }

  /**
   * Create a new temporary folder within the root temp folder
   */
  async mkTempFolder(): Promise<string> {
    const random = crypto.randomBytes(4).toString("hex");
    const tempFolder = join(this.rootTempFolder, `test_${random}`);
    fs.mkdirSync(tempFolder, { recursive: true });
    return tempFolder;
  }

  /**
   * Clean up all temporary folders
   */
  async cleanUp(): Promise<void> {
    const cwd = process.cwd();
    if (cwd.startsWith(this.rootTempFolder)) {
      process.chdir(os.tmpdir());
    }
    if (fs.existsSync(this.rootTempFolder)) {
      fs.rmSync(this.rootTempFolder, { recursive: true, force: true });
    }
  }
}

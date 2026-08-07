import { AppService } from "../../bindings/drawx";

export async function getDbPath(): Promise<string> {
  try {
    return await AppService.GetDbPath();
  } catch (error) {
    console.error("Failed to get database path:", error);
    return "App data directory (drawx.db)";
  }
}

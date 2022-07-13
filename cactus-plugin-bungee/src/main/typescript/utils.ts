export class Utils {
  static bufArray2HexStr(array: Uint8Array): string {
    return Buffer.from(array).toString("hex");
  }
}

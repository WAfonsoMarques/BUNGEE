export class Snapshot {
  private id: string;
  private version: Record<string, string>;
  private stateBins: string[]; //set of state bins
  private initialTime?: string;
  private finalTime?: string;
  private transactions: string[];

  constructor(
    id: string,
    version: Record<string, string>,
    stateBins: string[],
    initialTime: string,
    finalTime: string,
    transactions: string[],
  ) {
    this.id = id;
    this.version = version;
    this.stateBins = stateBins;
    this.initialTime = initialTime;
    this.finalTime = finalTime;
    this.transactions = transactions;
  }

  public printSnapshot(): string {
    return (
      "SNAPSHOT: \n " +
      this.id +
      " \n " +
      this.version +
      " \n " +
      this.stateBins +
      " \n " +
      this.transactions.toString()
    );
  }
}

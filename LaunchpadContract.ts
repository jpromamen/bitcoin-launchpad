import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Revert,
    SafeMath,
} from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '@btc-vision/btc-runtime/runtime/storage/maps/StoredMapU256';


@final
export class LaunchpadContract extends OP_NET {

    // Sale config
    private readonly saleTokenMap: StoredMapU256;
    private readonly salePriceMap: StoredMapU256;
    private readonly softCapMap: StoredMapU256;
    private readonly hardCapMap: StoredMapU256;
    private readonly startBlockMap: StoredMapU256;
    private readonly endBlockMap: StoredMapU256;
    private readonly totalRaisedMap: StoredMapU256;
    private readonly saleActiveMap: StoredMapU256;
    private readonly saleFinalizedMap: StoredMapU256;
    private readonly ownerMap: StoredMapU256;

    // User contributions
    private readonly contributions: StoredMapU256;
    private readonly claimed: StoredMapU256;

    constructor() {
        super();

        this.saleTokenMap = new StoredMapU256(Blockchain.nextPointer);
        this.salePriceMap = new StoredMapU256(Blockchain.nextPointer);
        this.softCapMap = new StoredMapU256(Blockchain.nextPointer);
        this.hardCapMap = new StoredMapU256(Blockchain.nextPointer);
        this.startBlockMap = new StoredMapU256(Blockchain.nextPointer);
        this.endBlockMap = new StoredMapU256(Blockchain.nextPointer);
        this.totalRaisedMap = new StoredMapU256(Blockchain.nextPointer);
        this.saleActiveMap = new StoredMapU256(Blockchain.nextPointer);
        this.saleFinalizedMap = new StoredMapU256(Blockchain.nextPointer);
        this.ownerMap = new StoredMapU256(Blockchain.nextPointer);
        this.contributions = new StoredMapU256(Blockchain.nextPointer);
        this.claimed = new StoredMapU256(Blockchain.nextPointer);
    }

    public override onDeployment(_calldata: Calldata): void {
        const sender = Blockchain.tx.sender;
        this.ownerMap.set(u256.Zero, this._addressToU256(sender));
    }

    // ── OWNER: Create Sale ──
    @method(
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'softCap', type: ABIDataTypes.UINT256 },
        { name: 'hardCap', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 }
    )
    @returns()
    public createSale(calldata: Calldata): BytesWriter {
        this._onlyOwner();

        const price = calldata.readU256();
        const softCap = calldata.readU256();
        const hardCap = calldata.readU256();
        const duration = calldata.readU256();

        if (this.saleActiveMap.get(u256.Zero) != u256.Zero) {
            throw new Revert('Sale already active');
        }

        const startBlock = Blockchain.block.number;
        const endBlock = SafeMath.add(u256.fromU64(startBlock), duration);

        this.salePriceMap.set(u256.Zero, price);
        this.softCapMap.set(u256.Zero, softCap);
        this.hardCapMap.set(u256.Zero, hardCap);
        this.startBlockMap.set(u256.Zero, u256.fromU64(startBlock));
        this.endBlockMap.set(u256.Zero, endBlock);
        this.totalRaisedMap.set(u256.Zero, u256.Zero);
        this.saleActiveMap.set(u256.Zero, u256.One);
        this.saleFinalizedMap.set(u256.Zero, u256.Zero);

        return new BytesWriter(0);
    }

    // ── BUY tokens ──
    @method({ name: 'amount', type: ABIDataTypes.UINT256 })
    @returns()
    public buy(calldata: Calldata): BytesWriter {
        const amount = calldata.readU256();
        const caller = Blockchain.tx.sender;
        const callerKey = this._addressToU256(caller);

        if (this.saleActiveMap.get(u256.Zero) == u256.Zero) {
            throw new Revert('No active sale');
        }

        const endBlock = this.endBlockMap.get(u256.Zero);
        if (u256.fromU64(Blockchain.block.number) > endBlock) {
            throw new Revert('Sale ended');
        }

        const hardCap = this.hardCapMap.get(u256.Zero);
        const totalRaised = this.totalRaisedMap.get(u256.Zero);
        const newTotal = SafeMath.add(totalRaised, amount);

        if (newTotal > hardCap) {
            throw new Revert('Hard cap reached');
        }

        this.contributions.set(callerKey, SafeMath.add(this.contributions.get(callerKey), amount));
        this.totalRaisedMap.set(u256.Zero, newTotal);

        return new BytesWriter(0);
    }

    // ── FINALIZE sale ──
    @method()
    @returns()
    public finalizeSale(_calldata: Calldata): BytesWriter {
        this._onlyOwner();

        if (this.saleFinalizedMap.get(u256.Zero) != u256.Zero) {
            throw new Revert('Already finalized');
        }

        this.saleActiveMap.set(u256.Zero, u256.Zero);
        this.saleFinalizedMap.set(u256.Zero, u256.One);

        return new BytesWriter(0);
    }

    // ── CLAIM tokens ──
    @method()
    @returns()
    public claim(_calldata: Calldata): BytesWriter {
        const caller = Blockchain.tx.sender;
        const callerKey = this._addressToU256(caller);

        if (this.saleFinalizedMap.get(u256.Zero) == u256.Zero) {
            throw new Revert('Sale not finalized');
        }

        const totalRaised = this.totalRaisedMap.get(u256.Zero);
        const softCap = this.softCapMap.get(u256.Zero);

        if (totalRaised < softCap) {
            throw new Revert('Soft cap not reached - use refund');
        }

        if (this.claimed.get(callerKey) != u256.Zero) {
            throw new Revert('Already claimed');
        }

        const contribution = this.contributions.get(callerKey);
        if (contribution.isZero()) throw new Revert('No contribution');

        const price = this.salePriceMap.get(u256.Zero);
        const PRECISION = u256.fromU64(1000000000000000000);
        const tokenAmount = SafeMath.div(SafeMath.mul(contribution, PRECISION), price);

        this.claimed.set(callerKey, u256.One);
        this._callTransfer(caller, tokenAmount);

        return new BytesWriter(0);
    }

    // ── REFUND if soft cap not reached ──
    @method()
    @returns()
    public refund(_calldata: Calldata): BytesWriter {
        const caller = Blockchain.tx.sender;
        const callerKey = this._addressToU256(caller);

        if (this.saleFinalizedMap.get(u256.Zero) == u256.Zero) {
            throw new Revert('Sale not finalized');
        }

        const totalRaised = this.totalRaisedMap.get(u256.Zero);
        const softCap = this.softCapMap.get(u256.Zero);

        if (totalRaised >= softCap) {
            throw new Revert('Soft cap reached - use claim');
        }

        const contribution = this.contributions.get(callerKey);
        if (contribution.isZero()) throw new Revert('No contribution to refund');

        if (this.claimed.get(callerKey) != u256.Zero) {
            throw new Revert('Already refunded');
        }

        this.claimed.set(callerKey, u256.One);
        this.contributions.set(callerKey, u256.Zero);

        return new BytesWriter(0);
    }

    // ── VIEW: Sale Info ──
    @method()
    @returns(
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'softCap', type: ABIDataTypes.UINT256 },
        { name: 'hardCap', type: ABIDataTypes.UINT256 },
        { name: 'totalRaised', type: ABIDataTypes.UINT256 },
        { name: 'endBlock', type: ABIDataTypes.UINT256 },
        { name: 'isActive', type: ABIDataTypes.UINT256 },
        { name: 'isFinalized', type: ABIDataTypes.UINT256 }
    )
    public getSaleInfo(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(224);
        writer.writeU256(this.salePriceMap.get(u256.Zero));
        writer.writeU256(this.softCapMap.get(u256.Zero));
        writer.writeU256(this.hardCapMap.get(u256.Zero));
        writer.writeU256(this.totalRaisedMap.get(u256.Zero));
        writer.writeU256(this.endBlockMap.get(u256.Zero));
        writer.writeU256(this.saleActiveMap.get(u256.Zero));
        writer.writeU256(this.saleFinalizedMap.get(u256.Zero));
        return writer;
    }

    // ── VIEW: User contribution ──
    @method({ name: 'user', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'contribution', type: ABIDataTypes.UINT256 },
        { name: 'claimed', type: ABIDataTypes.UINT256 }
    )
    public getUserInfo(calldata: Calldata): BytesWriter {
        const user = calldata.readAddress();
        const userKey = this._addressToU256(user);
        const writer = new BytesWriter(64);
        writer.writeU256(this.contributions.get(userKey));
        writer.writeU256(this.claimed.get(userKey));
        return writer;
    }

    private _onlyOwner(): void {
        const caller = this._addressToU256(Blockchain.tx.sender);
        if (caller != this.ownerMap.get(u256.Zero)) {
            throw new Revert('Not owner');
        }
    }

    private _addressToU256(addr: Address): u256 {
        const writer = new BytesWriter(32);
        writer.writeAddress(addr);
        const bytes = writer.getBuffer();
        return u256.fromBytes(bytes, true);
    }

    private _u256ToAddress(val: u256): Address {
        const bytes = val.toBytes(true);
        return Address.fromBytes(bytes);
    }

    private _callTransfer(to: Address, amount: u256): void {
        const cd = new BytesWriter(68);
        cd.writeSelector(0x3b88ef57);
        cd.writeAddress(to);
        cd.writeU256(amount);
        Blockchain.call(Blockchain.contractAddress, cd);
    }
}
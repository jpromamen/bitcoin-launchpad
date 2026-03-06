import { u256 } from '@btc-vision/as-bignum/assembly';
import {
    Address,
    Blockchain,
    BytesWriter,
    Calldata,
    OP_NET,
    Revert,
    SafeMath,
    encodeSelector,
} from '@btc-vision/btc-runtime/runtime';
import { StoredMapU256 } from '@btc-vision/btc-runtime/runtime/storage/maps/StoredMapU256';

// =============================================================================
// Storage Pointers — unique via Blockchain.nextPointer (CLAUDE.md rule)
// =============================================================================
const ownerPointer: u16 = Blockchain.nextPointer;
const salePricePointer: u16 = Blockchain.nextPointer;
const softCapPointer: u16 = Blockchain.nextPointer;
const hardCapPointer: u16 = Blockchain.nextPointer;
const startBlockPointer: u16 = Blockchain.nextPointer;
const endBlockPointer: u16 = Blockchain.nextPointer;
const totalRaisedPointer: u16 = Blockchain.nextPointer;
const saleActivePointer: u16 = Blockchain.nextPointer;
const saleFinalizedPointer: u16 = Blockchain.nextPointer;
const contributionsPointer: u16 = Blockchain.nextPointer;
const claimedPointer: u16 = Blockchain.nextPointer;

const GLOBAL_KEY: u256 = u256.Zero;

@final
export class LaunchpadContract extends OP_NET {

    private readonly ownerMap: StoredMapU256;
    private readonly salePriceMap: StoredMapU256;
    private readonly softCapMap: StoredMapU256;
    private readonly hardCapMap: StoredMapU256;
    private readonly startBlockMap: StoredMapU256;
    private readonly endBlockMap: StoredMapU256;
    private readonly totalRaisedMap: StoredMapU256;
    private readonly saleActiveMap: StoredMapU256;
    private readonly saleFinalizedMap: StoredMapU256;
    private readonly contributions: StoredMapU256;
    private readonly claimed: StoredMapU256;

    public constructor() {
        super();
        this.ownerMap = new StoredMapU256(ownerPointer);
        this.salePriceMap = new StoredMapU256(salePricePointer);
        this.softCapMap = new StoredMapU256(softCapPointer);
        this.hardCapMap = new StoredMapU256(hardCapPointer);
        this.startBlockMap = new StoredMapU256(startBlockPointer);
        this.endBlockMap = new StoredMapU256(endBlockPointer);
        this.totalRaisedMap = new StoredMapU256(totalRaisedPointer);
        this.saleActiveMap = new StoredMapU256(saleActivePointer);
        this.saleFinalizedMap = new StoredMapU256(saleFinalizedPointer);
        this.contributions = new StoredMapU256(contributionsPointer);
        this.claimed = new StoredMapU256(claimedPointer);
    }

    // CLAUDE.md: super.onDeployment() MUST be called first
    public override onDeployment(calldata: Calldata): void {
        super.onDeployment(calldata);
        this.ownerMap.set(GLOBAL_KEY, this._addressToU256(Blockchain.tx.origin));
    }

    // ── OWNER: Create Sale ────────────────────────────────────────────────────

    @method(
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'softCap', type: ABIDataTypes.UINT256 },
        { name: 'hardCap', type: ABIDataTypes.UINT256 },
        { name: 'durationBlocks', type: ABIDataTypes.UINT256 }
    )
    @returns({ name: 'endBlock', type: ABIDataTypes.UINT256 })
    public createSale(calldata: Calldata): BytesWriter {
        this._onlyOwner();

        const price = calldata.readU256();
        const softCap = calldata.readU256();
        const hardCap = calldata.readU256();
        const duration = calldata.readU256();

        if (!this.saleActiveMap.get(GLOBAL_KEY).isZero()) throw new Revert('Sale already active');
        if (price.isZero()) throw new Revert('Price must be > 0');
        if (u256.lt(hardCap, softCap)) throw new Revert('Hard cap below soft cap');

        const startBlock = u256.fromU64(Blockchain.block.number);
        const endBlock = SafeMath.add(startBlock, duration);

        this.salePriceMap.set(GLOBAL_KEY, price);
        this.softCapMap.set(GLOBAL_KEY, softCap);
        this.hardCapMap.set(GLOBAL_KEY, hardCap);
        this.startBlockMap.set(GLOBAL_KEY, startBlock);
        this.endBlockMap.set(GLOBAL_KEY, endBlock);
        this.totalRaisedMap.set(GLOBAL_KEY, u256.Zero);
        this.saleActiveMap.set(GLOBAL_KEY, u256.One);
        this.saleFinalizedMap.set(GLOBAL_KEY, u256.Zero);

        const writer = new BytesWriter(32);
        writer.writeU256(endBlock);
        return writer;
    }

    // ── BUY tokens ────────────────────────────────────────────────────────────

    @method(
        { name: 'tokenAddress', type: ABIDataTypes.ADDRESS },
        { name: 'amount', type: ABIDataTypes.UINT256 }
    )
    @returns({ name: 'newTotal', type: ABIDataTypes.UINT256 })
    public buy(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const amount = calldata.readU256();

        if (amount.isZero()) throw new Revert('Amount must be > 0');
        if (this.saleActiveMap.get(GLOBAL_KEY).isZero()) throw new Revert('No active sale');

        const endBlock = this.endBlockMap.get(GLOBAL_KEY).toU64();
        if (Blockchain.block.number > endBlock) throw new Revert('Sale ended');

        const hardCap = this.hardCapMap.get(GLOBAL_KEY);
        const totalRaised = this.totalRaisedMap.get(GLOBAL_KEY);
        const newTotal = SafeMath.add(totalRaised, amount);

        if (u256.gt(newTotal, hardCap)) throw new Revert('Hard cap reached');

        const callerKey = this._addressToU256(Blockchain.tx.sender);

        // CEI: state updates before external call
        this.contributions.set(callerKey, SafeMath.add(this.contributions.get(callerKey), amount));
        this.totalRaisedMap.set(GLOBAL_KEY, newTotal);

        // External call last
        this._transferFrom(token, Blockchain.tx.sender, Blockchain.contractAddress, amount);

        const writer = new BytesWriter(32);
        writer.writeU256(newTotal);
        return writer;
    }

    // ── FINALIZE sale ─────────────────────────────────────────────────────────

    @method()
    @returns({ name: 'success', type: ABIDataTypes.BOOL })
    public finalizeSale(_calldata: Calldata): BytesWriter {
        this._onlyOwner();
        if (!this.saleFinalizedMap.get(GLOBAL_KEY).isZero()) throw new Revert('Already finalized');

        this.saleActiveMap.set(GLOBAL_KEY, u256.Zero);
        this.saleFinalizedMap.set(GLOBAL_KEY, u256.One);

        const writer = new BytesWriter(1);
        writer.writeBoolean(true);
        return writer;
    }

    // ── CLAIM tokens ──────────────────────────────────────────────────────────

    @method({ name: 'tokenAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'tokenAmount', type: ABIDataTypes.UINT256 })
    public claim(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const caller = Blockchain.tx.sender;
        const callerKey = this._addressToU256(caller);

        if (this.saleFinalizedMap.get(GLOBAL_KEY).isZero()) throw new Revert('Sale not finalized');

        const totalRaised = this.totalRaisedMap.get(GLOBAL_KEY);
        const softCap = this.softCapMap.get(GLOBAL_KEY);
        if (u256.lt(totalRaised, softCap)) throw new Revert('Soft cap not reached - use refund');

        if (!this.claimed.get(callerKey).isZero()) throw new Revert('Already claimed');

        const contribution = this.contributions.get(callerKey);
        if (contribution.isZero()) throw new Revert('No contribution');

        const price = this.salePriceMap.get(GLOBAL_KEY);
        // CLAUDE.md: use fromString for big numbers to avoid u64 overflow
        const PRECISION: u256 = u256.fromString('1000000000000000000');
        const tokenAmount = SafeMath.div(SafeMath.mul(contribution, PRECISION), price);

        // CEI: mark claimed before transfer
        this.claimed.set(callerKey, u256.One);
        this._transfer(token, caller, tokenAmount);

        const writer = new BytesWriter(32);
        writer.writeU256(tokenAmount);
        return writer;
    }

    // ── REFUND if soft cap not reached ────────────────────────────────────────

    @method({ name: 'tokenAddress', type: ABIDataTypes.ADDRESS })
    @returns({ name: 'refundAmount', type: ABIDataTypes.UINT256 })
    public refund(calldata: Calldata): BytesWriter {
        const token = calldata.readAddress();
        const caller = Blockchain.tx.sender;
        const callerKey = this._addressToU256(caller);

        if (this.saleFinalizedMap.get(GLOBAL_KEY).isZero()) throw new Revert('Sale not finalized');

        const totalRaised = this.totalRaisedMap.get(GLOBAL_KEY);
        const softCap = this.softCapMap.get(GLOBAL_KEY);
        if (!u256.lt(totalRaised, softCap)) throw new Revert('Soft cap reached - use claim');

        if (!this.claimed.get(callerKey).isZero()) throw new Revert('Already refunded');

        const contribution = this.contributions.get(callerKey);
        if (contribution.isZero()) throw new Revert('No contribution to refund');

        // CEI: state updates before external call
        this.claimed.set(callerKey, u256.One);
        this.contributions.set(callerKey, u256.Zero);
        this._transfer(token, caller, contribution);

        const writer = new BytesWriter(32);
        writer.writeU256(contribution);
        return writer;
    }

    // ── VIEW: Sale Info ───────────────────────────────────────────────────────

    @method()
    @returns(
        { name: 'price', type: ABIDataTypes.UINT256 },
        { name: 'softCap', type: ABIDataTypes.UINT256 },
        { name: 'hardCap', type: ABIDataTypes.UINT256 },
        { name: 'totalRaised', type: ABIDataTypes.UINT256 },
        { name: 'endBlock', type: ABIDataTypes.UINT64 },
        { name: 'isActive', type: ABIDataTypes.BOOL },
        { name: 'isFinalized', type: ABIDataTypes.BOOL }
    )
    public getSaleInfo(_calldata: Calldata): BytesWriter {
        const writer = new BytesWriter(130);
        writer.writeU256(this.salePriceMap.get(GLOBAL_KEY));
        writer.writeU256(this.softCapMap.get(GLOBAL_KEY));
        writer.writeU256(this.hardCapMap.get(GLOBAL_KEY));
        writer.writeU256(this.totalRaisedMap.get(GLOBAL_KEY));
        writer.writeU64(this.endBlockMap.get(GLOBAL_KEY).toU64());
        writer.writeBoolean(!this.saleActiveMap.get(GLOBAL_KEY).isZero());
        writer.writeBoolean(!this.saleFinalizedMap.get(GLOBAL_KEY).isZero());
        return writer;
    }

    // ── VIEW: User Info ───────────────────────────────────────────────────────

    @method({ name: 'user', type: ABIDataTypes.ADDRESS })
    @returns(
        { name: 'contribution', type: ABIDataTypes.UINT256 },
        { name: 'claimed', type: ABIDataTypes.BOOL }
    )
    public getUserInfo(calldata: Calldata): BytesWriter {
        const user = calldata.readAddress();
        const userKey = this._addressToU256(user);
        const writer = new BytesWriter(33);
        writer.writeU256(this.contributions.get(userKey));
        writer.writeBoolean(!this.claimed.get(userKey).isZero());
        return writer;
    }

    // ── Internal Helpers ──────────────────────────────────────────────────────

    private _onlyOwner(): void {
        const owner = this._u256ToAddress(this.ownerMap.get(GLOBAL_KEY));
        if (!Blockchain.tx.sender.equals(owner)) throw new Revert('Not owner');
    }

    private _transferFrom(token: Address, from: Address, to: Address, amount: u256): void {
        const cd = new BytesWriter(100);
        cd.writeSelector(encodeSelector('transferFrom(address,address,uint256)'));
        cd.writeAddress(from);
        cd.writeAddress(to);
        cd.writeU256(amount);
        const result = Blockchain.call(token, cd);
        if (!result.readBoolean()) throw new Revert('TransferFrom failed');
    }

    private _transfer(token: Address, to: Address, amount: u256): void {
        const cd = new BytesWriter(68);
        cd.writeSelector(encodeSelector('transfer(address,uint256)'));
        cd.writeAddress(to);
        cd.writeU256(amount);
        const result = Blockchain.call(token, cd);
        if (!result.readBoolean()) throw new Revert('Transfer failed');
    }

    protected _addressToU256(addr: Address): u256 {
        return u256.fromUint8ArrayBE(addr);
    }

    protected _u256ToAddress(val: u256): Address {
        if (val.isZero()) return Address.zero();
        return Address.fromUint8Array(val.toUint8Array(true));
    }
}

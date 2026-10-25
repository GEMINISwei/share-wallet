"""旅遊錢包的結算: 清償方案、開始與取消結算、標記付款與確認收款。

規則見 docs/features.md〈結算流程〉〈封存〉。狀態的每一次轉換都先鎖住錢包那一列
(`WalletTable.lock_status`), 記帳也鎖同一列, 所以方案算完之後不會再有帳寫進來。
這些操作不寫異動紀錄: 異動紀錄只記帳目, 每一筆轉帳自己記著付款與確認的人和時間。
"""

from modules.users.public import find_nicknames
from shared.auth.contracts import CurrentUser
from shared.http.errors import LangException
from shared.time import utc_now

from .access import WalletAccess
from .errors import WalletError
from .expenses import net_amounts, open_travel_wallet
from .model import (
    PlannedTransfer,
    SettlementTransferDetail,
    TravelExpenseTable,
    TravelSettlementTransferTable,
    WalletStatus,
    WalletTable,
)
from .schema import EntryUser, SettlementInfo, SettlementOperate, SettlementTransferInfo


def plan_transfers(nets: list[tuple[str, int]]) -> list[PlannedTransfer]:
    """依每人淨額 (依加入順序, 加總為 0) 算出清償方案, 依付款人、收款人的加入順序排列。

    先把金額剛好相同的一對配成一筆, 剩下的每次讓應付最多的付給應收最多的, 同額照加入順序。
    每一筆至少讓一個人歸零, 所以最多是有帳的人數 − 1 筆。不追求真正最少的理由見
    docs/features.md〈結算流程〉。
    """
    order = {user_id: index for index, (user_id, _) in enumerate(nets)}
    debts = {user_id: -net for user_id, net in nets if net < 0}
    credits = {user_id: net for user_id, net in nets if net > 0}
    transfers: list[PlannedTransfer] = []

    def pay(debtor: str, creditor: str, amount: int) -> None:
        transfers.append({"from_user_id": debtor, "to_user_id": creditor, "amount": amount})
        for balances, user_id in ((debts, debtor), (credits, creditor)):
            balances[user_id] -= amount
            if balances[user_id] == 0:
                del balances[user_id]

    for debtor in list(debts):
        match = next((user_id for user_id in credits if credits[user_id] == debts[debtor]), None)
        if match is not None:
            pay(debtor, match, debts[debtor])

    def largest(balances: dict[str, int]) -> str:
        return max(balances, key=lambda user_id: (balances[user_id], -order[user_id]))

    while debts:
        debtor, creditor = largest(debts), largest(credits)
        pay(debtor, creditor, min(debts[debtor], credits[creditor]))

    transfers.sort(key=lambda t: (order[t["from_user_id"]], order[t["to_user_id"]]))
    return transfers


def _ensure_manage(access: WalletAccess) -> None:
    if not access.can_manage:
        raise LangException(403, WalletError.NOT_ADMIN)


async def _lock(wallet_id: str) -> WalletStatus:
    status = await WalletTable.lock_status(wallet_id)
    if status is None:
        raise LangException(404, WalletError.NOT_FOUND)
    return status


def _ensure_settling(status: WalletStatus) -> None:
    if status is WalletStatus.SETTLED:
        raise LangException(409, WalletError.WALLET_ARCHIVED)
    if status is not WalletStatus.SETTLING:
        raise LangException(409, WalletError.NOT_SETTLING)


async def get_settlement(wallet_id: str, current_user: CurrentUser) -> SettlementInfo:
    access = await open_travel_wallet(wallet_id, current_user)
    transfers = await TravelSettlementTransferTable.list_in_wallet(wallet_id)
    user_ids = {
        user_id
        for transfer in transfers
        for user_id in (transfer["from_user_id"], transfer["to_user_id"], transfer["confirmed_by"])
        if user_id is not None
    }
    nicknames = await find_nicknames(list(user_ids))

    def person(user_id: str) -> EntryUser:
        return EntryUser(user_id=user_id, nickname=nicknames.get(user_id, ""))

    items = [
        SettlementTransferInfo(
            id=transfer["id"],
            payer=person(transfer["from_user_id"]),
            payee=person(transfer["to_user_id"]),
            amount=transfer["amount"],
            paid_at=transfer["paid_at"],
            confirmed_at=transfer["confirmed_at"],
            confirmed_by=None if transfer["confirmed_by"] is None else person(
                transfer["confirmed_by"]
            ),
        )
        for transfer in transfers
    ]
    return SettlementInfo(status=WalletStatus(access.wallet["status"]), transfers=items)


async def start_settlement(wallet_id: str, current_user: CurrentUser) -> SettlementOperate:
    """大家的淨額都是 0 時方案是空的, 直接已結帳。一筆帳都沒有時不能結算。"""
    _ensure_manage(await open_travel_wallet(wallet_id, current_user))
    status = await _lock(wallet_id)
    if status is WalletStatus.SETTLED:
        raise LangException(409, WalletError.WALLET_ARCHIVED)
    if status is not WalletStatus.ACTIVE:
        raise LangException(409, WalletError.SETTLEMENT_STARTED)
    # 在鎖住之後才查, 才不會跟刪掉最後一筆帳的請求交錯。沒有帳的錢包結算只會直接封存,
    # 不會是任何人想要的結果 (見 docs/features.md〈結算流程〉)。
    if not await TravelExpenseTable.totals(wallet_id):
        raise LangException(409, WalletError.NO_EXPENSES_TO_SETTLE)

    transfers = plan_transfers(await net_amounts(wallet_id))
    await TravelSettlementTransferTable.create_plan(wallet_id, transfers)
    status = WalletStatus.SETTLING if transfers else WalletStatus.SETTLED
    await WalletTable.set_status(wallet_id, status)
    return SettlementOperate(status=status)


async def cancel_settlement(wallet_id: str, current_user: CurrentUser) -> SettlementOperate:
    """方案連同付款與確認一起作廢。已結帳的不能回頭。"""
    _ensure_manage(await open_travel_wallet(wallet_id, current_user))
    _ensure_settling(await _lock(wallet_id))
    await TravelSettlementTransferTable.delete_in_wallet(wallet_id)
    await WalletTable.set_status(wallet_id, WalletStatus.ACTIVE)
    return SettlementOperate(status=WalletStatus.ACTIVE)


async def _locked_transfer(
    wallet_id: str, transfer_id: str, current_user: CurrentUser
) -> tuple[WalletAccess, SettlementTransferDetail]:
    access = await open_travel_wallet(wallet_id, current_user)
    _ensure_settling(await _lock(wallet_id))
    transfer = await TravelSettlementTransferTable.find_detail_in_wallet(wallet_id, transfer_id)
    if transfer is None:
        raise LangException(404, WalletError.SETTLEMENT_TRANSFER_NOT_FOUND)
    return access, transfer


def _settling() -> SettlementOperate:
    return SettlementOperate(status=WalletStatus.SETTLING)


async def _payer_transfer(
    wallet_id: str, transfer_id: str, current_user: CurrentUser
) -> SettlementTransferDetail:
    """只有付款人自己能標記或撤回, 管理者也不行; 確認之後就不能再動。"""
    _, transfer = await _locked_transfer(wallet_id, transfer_id, current_user)
    if transfer["from_user_id"] != current_user["id"]:
        raise LangException(403, WalletError.NOT_SETTLEMENT_PAYER)
    if transfer["confirmed_at"] is not None:
        raise LangException(409, WalletError.SETTLEMENT_CONFIRMED)
    return transfer


async def mark_paid(
    wallet_id: str, transfer_id: str, current_user: CurrentUser
) -> SettlementOperate:
    """已經標記過時保留原本的時間。"""
    transfer = await _payer_transfer(wallet_id, transfer_id, current_user)
    if transfer["paid_at"] is None:
        await TravelSettlementTransferTable.set_paid(transfer_id, utc_now())
    return _settling()


async def unmark_paid(
    wallet_id: str, transfer_id: str, current_user: CurrentUser
) -> SettlementOperate:
    await _payer_transfer(wallet_id, transfer_id, current_user)
    await TravelSettlementTransferTable.set_paid(transfer_id, None)
    return _settling()


async def confirm_transfer(
    wallet_id: str, transfer_id: str, current_user: CurrentUser
) -> SettlementOperate:
    """收款人或管理者確認, 不必等付款人先標記; 付款人自己不行, 就算他是管理者。

    最後一筆確認後錢包就封存了, 所以這一筆撤不回 (撤銷只在結算中可以)。
    """
    access, transfer = await _locked_transfer(wallet_id, transfer_id, current_user)
    if transfer["from_user_id"] == current_user["id"]:
        raise LangException(403, WalletError.PAYER_CANNOT_CONFIRM)
    if transfer["to_user_id"] != current_user["id"] and not access.can_manage:
        raise LangException(403, WalletError.NOT_SETTLEMENT_PAYEE)
    if transfer["confirmed_at"] is not None:
        return _settling()

    await TravelSettlementTransferTable.set_confirmed(transfer_id, current_user["id"], utc_now())
    if await TravelSettlementTransferTable.count_unconfirmed(wallet_id) > 0:
        return _settling()
    await WalletTable.set_status(wallet_id, WalletStatus.SETTLED)
    return SettlementOperate(status=WalletStatus.SETTLED)


async def unconfirm_transfer(
    wallet_id: str, transfer_id: str, current_user: CurrentUser
) -> SettlementOperate:
    """確認的人或管理者可以撤銷; 「我已付款」的標記保留。"""
    access, transfer = await _locked_transfer(wallet_id, transfer_id, current_user)
    if transfer["confirmed_at"] is None:
        return _settling()
    if transfer["confirmed_by"] != current_user["id"] and not access.can_manage:
        raise LangException(403, WalletError.NOT_CONFIRMER)
    await TravelSettlementTransferTable.set_confirmed(transfer_id, None, None)
    return _settling()

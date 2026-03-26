from app.core.config import settings


CATEGORY_RULES = {
    "Groceries": ["grocery", "supermarket", "mart", "foods", "checkers", "pick n pay", "spar"],
    "Transport": ["uber", "bolt", "fuel", "garage", "shell", "engen", "taxi"],
    "Utilities": ["electric", "water", "utility", "telkom", "vodacom", "mtn"],
    "Entertainment": ["cinema", "movie", "netflix", "spotify", "restaurant", "takeaway"],
    "Medical": ["pharmacy", "clinic", "hospital", "doctor", "med"],
    "Salary/Income": ["salary", "payroll", "income", "bonus"],
    "Transfer": ["transfer", "payment to", "payment from", "immediate payment"],
    "Cash Withdrawal": ["atm", "cash withdrawal", "cash wdl"],
}


def guess_category(description: str) -> str:
    lowered = description.lower()
    for category, keywords in CATEGORY_RULES.items():
        if any(keyword in lowered for keyword in keywords):
            return category
    return "Other"


def row_needs_review(description: str, amount: float) -> bool:
    return len(description.strip()) < 4 or amount == 0


def available_categories() -> list[str]:
    return settings.default_categories

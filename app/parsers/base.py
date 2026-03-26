from abc import ABC, abstractmethod

from app.models.schemas import ReceiptRow, StatementRow


class BaseStatementParser(ABC):
    @abstractmethod
    def parse(self, text: str, source_file: str) -> list[StatementRow]:
        raise NotImplementedError


class BaseReceiptParser(ABC):
    @abstractmethod
    def parse(self, text: str, source_file: str, confidence: float) -> list[ReceiptRow]:
        raise NotImplementedError

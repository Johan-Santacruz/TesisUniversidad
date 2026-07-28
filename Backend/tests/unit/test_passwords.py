from __future__ import annotations

from app.security.passwords import PasswordService


def test_argon2id_hash_verifies_only_the_original_password():
    service = PasswordService()

    encoded = service.hash("Frase-segura-2026!")

    assert encoded.startswith("$argon2id$")
    assert "Frase-segura-2026!" not in encoded
    assert service.verify("Frase-segura-2026!", encoded) is True
    assert service.verify("otra-frase", encoded) is False


def test_argon2_parameters_are_marked_for_rehash_when_policy_changes():
    original = PasswordService(time_cost=1, memory_cost_kib=8192)
    stronger = PasswordService(time_cost=2, memory_cost_kib=8192)

    encoded = original.hash("Frase-segura-2026!")

    assert stronger.needs_rehash(encoded) is True


"""Tests for the CM1/CM2 countermeasure switches of the QKD model (WP3)."""
import os
import subprocess
import unittest
from hashlib import sha256

from bench import registry
from bench.protocols import qkd

# sha256 of the cleaned theory text produced by bench.protocols.qkd.assemble BEFORE the CM1/CM2
# flags were added (commit d5c0eaa fragments), for every (family, adversary, reconciliation,
# basis order, exec, secrecy, auth) point below. With cm1=cm2=False the assembly must still
# produce exactly these bytes. The EB/Network/TWEC/PostM all-lemmas entry equals the model hash
# recorded in evidence/index.json by the baseline batch.
PRE_CHANGE_SHA256 = {
    ("PM", "Network", "FEC", "SeqA", True, True, True): "b846a7c9b7548402af27737c2d71083f950187897a85863cd9fdc1bce9840d92",
    ("PM", "Network", "FEC", "SeqA", True, False, False): "759d9fa4d14aca15d5717c4a64e25dae43ba8b2397df103586db0171c0354f63",
    ("PM", "Network", "FEC", "SeqA", False, False, False): "49aae4965c1f26f9badd2e0d77c3bdf1daf1b37a1f2980d3837e895c283c726c",
    ("PM", "Network", "FEC", "SeqB", True, True, True): "c3359584ab017961c417fe83e0eae9e66f06c21a02c4c83e17eeb1f10d3a2409",
    ("PM", "Network", "FEC", "SeqB", True, False, False): "dccb0c73931d6445553b2c51946da44a398f63533cfb8166e3aac7b95b757dc0",
    ("PM", "Network", "FEC", "SeqB", False, False, False): "5c7e501ef263d58dbd4ef87b3cbcbf5aa1e0ebddb36b9bd70dd596d8d3ac4cfb",
    ("PM", "Network", "FEC", "PostM", True, True, True): "53c36223ac1bcbb0e25a176df09be426f3307fedbd61c3aa026f72755461e7c7",
    ("PM", "Network", "FEC", "PostM", True, False, False): "f5047fd809a046e95b2a67771af2421bb314b9899ca927d75256cd9bf9572f25",
    ("PM", "Network", "FEC", "PostM", False, False, False): "5a86ccdb808d7d4b953ceccaa35bf1348b43280ccc905c98d8c6f8c5acfea6ac",
    ("PM", "Network", "REC", "SeqA", True, True, True): "16c19ad620f6062745fce6c804cbc5c0fda65dbaf4355dbede966cbf9f0d9f21",
    ("PM", "Network", "REC", "SeqA", True, False, False): "f927803859db7e192997024e8f8e2837f40637a3ff0f5b41f4ffd50f2b4cc2c3",
    ("PM", "Network", "REC", "SeqA", False, False, False): "e32d6a90a0c76cec99cb1c595740cdc579ab114c75a1783e8c4b8e9809a622e7",
    ("PM", "Network", "REC", "SeqB", True, True, True): "88be726b9b755e6e1d1c0c8606a455435cdd5a358fcb3090fa3b8c7dbae071e6",
    ("PM", "Network", "REC", "SeqB", True, False, False): "39cb1ff6d32d8bd27ae3f0937cdf9dc43d808479c98ee194195a15172a9d0b30",
    ("PM", "Network", "REC", "SeqB", False, False, False): "b1ace3b9c78f9c86f42c449aa14c0ebe4e69d44d7a13d84953de79d19ee23336",
    ("PM", "Network", "REC", "PostM", True, True, True): "7fff709476d11d167cdc63c57ca171564094d4b8c4d2ab76ed294a97d6c83cd4",
    ("PM", "Network", "REC", "PostM", True, False, False): "aa358cc1598a48b51d1c522ebd42830b9a30c43e42cd0d5f02364ee45d2f1231",
    ("PM", "Network", "REC", "PostM", False, False, False): "19fac39bc4c10188b582f9df8463a035745d41ad2acbeb89f9be0d0085fd6fef",
    ("PM", "Network", "TWEC", "SeqA", True, True, True): "5d9de3c45a8a078bbcaafface4b986f8bab08bd8cf9fd149429315b9c0dcb8d5",
    ("PM", "Network", "TWEC", "SeqA", True, False, False): "e4fb28c7c9846c3a9c046391f37e41d7fe7a7ddf59efb043cb1ae04191320c5e",
    ("PM", "Network", "TWEC", "SeqA", False, False, False): "719e9632da0e88d0a8c94bf69e5f49ef6b8b53d1739174bdc1f06931f22ed455",
    ("PM", "Network", "TWEC", "SeqB", True, True, True): "86275a3938854383b1a13b7e54bf45b684af8f16a78524bb55990cadd55d081d",
    ("PM", "Network", "TWEC", "SeqB", True, False, False): "9026b6804eabcd6529c30b0a6afaafeb303f68de5430ace5bf532661925f6d38",
    ("PM", "Network", "TWEC", "SeqB", False, False, False): "80871a500dc88354a3e258a4d7d6bcad392ddd2be867273f3e429229fcc61443",
    ("PM", "Network", "TWEC", "PostM", True, True, True): "c2e5b0b32078c17e984c90f1621985cf6c10b32fa0b11f1adfaf925601c84075",
    ("PM", "Network", "TWEC", "PostM", True, False, False): "7fa1be220883446cf31afc8fb34a5a90d1c30ba698a9ad0b6fc6093df7c771cd",
    ("PM", "Network", "TWEC", "PostM", False, False, False): "91536f8359e84b45e658adc460dd82d6f1a904e391c1946c49350801fa644c44",
    ("PM", "MaliciousUser", "FEC", "SeqA", True, True, True): "afb460be785f12634dd5f6a8240c1886e464d9bb6194840d13dce5bf179d7341",
    ("PM", "MaliciousUser", "FEC", "SeqA", True, False, False): "253aab6540856b616c7d208665d28d1c831baf9e7d0960813cb13886dacd1f23",
    ("PM", "MaliciousUser", "FEC", "SeqA", False, False, False): "53d202bc9a8b60c585bed110afcd892eda493d120dcbde3a368be85944f9b613",
    ("PM", "MaliciousUser", "FEC", "SeqB", True, True, True): "5ca2195d29da42bdb17bf561ea166730464e8a732349b84da5e34c1bbbfe1000",
    ("PM", "MaliciousUser", "FEC", "SeqB", True, False, False): "1b99a8144c678b6a9e8f509b312710f960d3c33fb3167c11ac34399293ba1c2c",
    ("PM", "MaliciousUser", "FEC", "SeqB", False, False, False): "a1b35b8932d3dc7982b40ac19920ff5ef8120b21ba8500a59e6f51b45f62c0bd",
    ("PM", "MaliciousUser", "FEC", "PostM", True, True, True): "a7a4c869313a460367bf01d430f24e90dc1ff862320abbdf4005f81ced2bd93b",
    ("PM", "MaliciousUser", "FEC", "PostM", True, False, False): "e9fa8a2ae5e70137891352d81e75dc4e170189bba95c9c0ea00a7c50861e064b",
    ("PM", "MaliciousUser", "FEC", "PostM", False, False, False): "09e8e7884a000b51ff0d33d1b715de07d71984e3ccaecb6a9da86310125366a8",
    ("PM", "MaliciousUser", "REC", "SeqA", True, True, True): "961e670f51d013d35e945a21a8a0f6df81112888450b9812e63318e8ba50e44c",
    ("PM", "MaliciousUser", "REC", "SeqA", True, False, False): "7f740d6d3057e12acdf384166c283e9b881bbc96835e0afa6ab26f1354bb97e3",
    ("PM", "MaliciousUser", "REC", "SeqA", False, False, False): "3f49c4da0d4c43097d6b99c003241a93ec398f6811edcba7b2e8461ac1d606bc",
    ("PM", "MaliciousUser", "REC", "SeqB", True, True, True): "a291f3f5f1b6fded1ebb789fd2a4ad0ad3c7732e092c26bd367b276bad91e656",
    ("PM", "MaliciousUser", "REC", "SeqB", True, False, False): "57c7dd0e8bbf34b15614cbf10f08f3dc07036bd1fb5fd7afffe26099b75e93c0",
    ("PM", "MaliciousUser", "REC", "SeqB", False, False, False): "e49003c3ad7063fcde63cc8b246592149eaabd5090aae924cae5b1c92df86370",
    ("PM", "MaliciousUser", "REC", "PostM", True, True, True): "a7b63f0777312e33760d3dbf22b332827ce06346d459ee6a1044b474c381daf9",
    ("PM", "MaliciousUser", "REC", "PostM", True, False, False): "da1c5412afb44a1ce55646b5663ab2ae0774ff6701b725681a8b865fa8a748da",
    ("PM", "MaliciousUser", "REC", "PostM", False, False, False): "8be85b5ae129abf5b0a950518bf455ffcb5b94100481b509541eb2d610c11e0f",
    ("PM", "MaliciousUser", "TWEC", "SeqA", True, True, True): "cf1543514703004a0ace6af8b4eaaaab9e5301c2aa1540d4378827d9106af8d6",
    ("PM", "MaliciousUser", "TWEC", "SeqA", True, False, False): "d480754d7f2d01cee8e564dbaf1a0f559b6240f2bffd76a158d39b2ec1d4d1d8",
    ("PM", "MaliciousUser", "TWEC", "SeqA", False, False, False): "6ea92da3ba765a9beeb0f6040daf863b1a457063fee38f6fcb2666e1bc6bb6a1",
    ("PM", "MaliciousUser", "TWEC", "SeqB", True, True, True): "fcd2600d051d57d4a7e932abc36863ddab5ab9ca320930bb027d11953eb05555",
    ("PM", "MaliciousUser", "TWEC", "SeqB", True, False, False): "8b0e4f944ba7cf3c22aa2c4098a3b47717e403b1784820830765fd2597b28680",
    ("PM", "MaliciousUser", "TWEC", "SeqB", False, False, False): "54e7cd59a58217af116bee0665740c63e64f134469b74d74ceb8ac6b49d0fa27",
    ("PM", "MaliciousUser", "TWEC", "PostM", True, True, True): "0ab7a19863e065797ed1d39af2087e02b66793094b90ec229146956a059be81a",
    ("PM", "MaliciousUser", "TWEC", "PostM", True, False, False): "5b779cb28cdf81620e9d6fa40e880ec38a7d35e0b5fc020695e84b8250336b3d",
    ("PM", "MaliciousUser", "TWEC", "PostM", False, False, False): "27ebe17166863536bae25328c513eb89daef750ef9625c68b31b27db9b46199b",
    ("EB", "Network", "FEC", "SeqA", True, True, True): "84f226217aa75b0fe30876e39ed5b51d9f66017c0ab6f36bbef521d9d8db5b7d",
    ("EB", "Network", "FEC", "SeqA", True, False, False): "90d44bce7c6f25bd0ff42eaaec7b9867400eda58bf053ed03593058d3f4bfe89",
    ("EB", "Network", "FEC", "SeqA", False, False, False): "8b846f97e5af3b081787ed83bff99bd28449994d4b4d087184ba8b6684f6f374",
    ("EB", "Network", "FEC", "SeqB", True, True, True): "18bac5d9d0418df9198778585769b0ec3989b3d8de918d28d918f01ff7d42733",
    ("EB", "Network", "FEC", "SeqB", True, False, False): "514683f19113629eccb4326850ee814b309ced39ef9f86601aa5e62b687ae96c",
    ("EB", "Network", "FEC", "SeqB", False, False, False): "b6c17307c8bdf51e2512f68312f7d9de188fe63ca1c7f56f76d21b283abc674b",
    ("EB", "Network", "FEC", "PostM", True, True, True): "02df2dafbbd38415e5dc8c8fd381ba44877816235b67aabfe67fd380a057280f",
    ("EB", "Network", "FEC", "PostM", True, False, False): "b2ef6a0f8ef6c84f38f5e0acae6607ca8f025edd374c2976ee3f7a91f546af2c",
    ("EB", "Network", "FEC", "PostM", False, False, False): "552b5ba18e1a2a46305f9af3950f442af0085d5fb137b701335ed16e9b8312d7",
    ("EB", "Network", "REC", "SeqA", True, True, True): "84d9cb21bc1186f902cdef45cc45b626b67fc3bce5c2deced1bcff3c6585e5ca",
    ("EB", "Network", "REC", "SeqA", True, False, False): "0c3cbb4c6c3da568fd076b31bbf83100ea252076e4320133f3a0c450e3bdefd9",
    ("EB", "Network", "REC", "SeqA", False, False, False): "84ee09b123d8e1ae27f13045ec38f344ca11567f3449d4b0dcb5e40c0f0c142f",
    ("EB", "Network", "REC", "SeqB", True, True, True): "9444f9aa24da1fe45c12b532dfc5cfb058f64a550690ce876df0472cf334de99",
    ("EB", "Network", "REC", "SeqB", True, False, False): "14f04e247c2dc3620dad432060df194afc2265d2934aea38fa0c82daf9ab34a3",
    ("EB", "Network", "REC", "SeqB", False, False, False): "f5a6be26e6ffb7e723091402ade6aa71643b8b5126fa6f9b6037453d10dcef1f",
    ("EB", "Network", "REC", "PostM", True, True, True): "1134d4e09296855beb53c44d30a696c05b2d71fdbf04ad93e6966c1dde62c610",
    ("EB", "Network", "REC", "PostM", True, False, False): "229eda210bf226bc6f329271650f936df898db61e86df5a64b5fea370cea1fe4",
    ("EB", "Network", "REC", "PostM", False, False, False): "41d2f986e3b12de9af3398d32973b83e8e67de1a7300f7022c969dd08a76530e",
    ("EB", "Network", "TWEC", "SeqA", True, True, True): "26d2bfc9a7efb06e46a4a9a44d4b9821323c4e142d2e0cf76fa16c9068efb56d",
    ("EB", "Network", "TWEC", "SeqA", True, False, False): "3431dc43434221f988001282df6e847ffca9606b0625aa5063493d75a72be861",
    ("EB", "Network", "TWEC", "SeqA", False, False, False): "f6b0ad8b96e5c3144d6ff854307da748ecff151920e6591940300f0d86580f04",
    ("EB", "Network", "TWEC", "SeqB", True, True, True): "f18bbb442faae207e92a77d9b5210a9792361db91c0c74f2caa2c50289812883",
    ("EB", "Network", "TWEC", "SeqB", True, False, False): "fc35ef2c020e6c8da671b2fd5bcfb337449b8a498c7864fd119fbd2eb54d88a7",
    ("EB", "Network", "TWEC", "SeqB", False, False, False): "64c6590c140b73d3bb1d3e48c327b5ab11fc6a8defec29c8fef9283959cc3d8b",
    ("EB", "Network", "TWEC", "PostM", True, True, True): "25649aadd91c6d8314853add77e484bb4c040a1d575c0a65d0ebb22821c7e986",
    ("EB", "Network", "TWEC", "PostM", True, False, False): "a57b7aab71a2526da2abcccbc969f4e04d8981e9585f9bca784b1db4eef29e3d",
    ("EB", "Network", "TWEC", "PostM", False, False, False): "34a51c3d23ddcabb7abd883fc4b8e42a99ecff9428ad7a8c2361df7813cf324f",
    ("EB", "MaliciousUser", "FEC", "SeqA", True, True, True): "f5fcb740a085de9a1a79dd3c4ad5f18ee767e794fe469778215c0559c4ecabf7",
    ("EB", "MaliciousUser", "FEC", "SeqA", True, False, False): "0c642af146aa2a27fe197b38e5c88dd0e3f7eb4d50bbb55922089fe609c07443",
    ("EB", "MaliciousUser", "FEC", "SeqA", False, False, False): "5d71bd975b70d2322ea42fcaa4499c2b292e876ad48b43d03bd5798f3fe067ed",
    ("EB", "MaliciousUser", "FEC", "SeqB", True, True, True): "f314a5b0aa84629776289aade487bf9fd6d1a8816dfc8457de3e1f54dd0e7d7d",
    ("EB", "MaliciousUser", "FEC", "SeqB", True, False, False): "336dee7874f4ba629c9aa958f4250e5877a0a568c2009fbd33fb209b6ffc7da7",
    ("EB", "MaliciousUser", "FEC", "SeqB", False, False, False): "a5ba10644a9e51db39bfe23b1c0996f2987fdd21413562d1ce065d6d63d9e151",
    ("EB", "MaliciousUser", "FEC", "PostM", True, True, True): "c6bcd3260fabd2fe6d3404fa653053d730ba2a7eabc249b10f94a8a5f92a5911",
    ("EB", "MaliciousUser", "FEC", "PostM", True, False, False): "b1eba23062f09281c0b5a06be9ac38da9faaf18e97363084805a8b5e0e2b9943",
    ("EB", "MaliciousUser", "FEC", "PostM", False, False, False): "cce35c5ec6ef49d35bfbf6cc83cc27bb5ca7a87eabf6360b44d527c7a21ceb04",
    ("EB", "MaliciousUser", "REC", "SeqA", True, True, True): "e84cdcd1bebe532c0c4f3e2aec52dc53deaad72456c20707cd3d11e85d8b0efa",
    ("EB", "MaliciousUser", "REC", "SeqA", True, False, False): "515c6780a66624d02d7f823e1c82a60e01d8a69c5e56600b1fe99266491cd416",
    ("EB", "MaliciousUser", "REC", "SeqA", False, False, False): "a38af94e831ab7ac25a6eab2df8d9b9801bb765614116ed53580522279132183",
    ("EB", "MaliciousUser", "REC", "SeqB", True, True, True): "da250da8c34706e71668be6b94d2308b4f1d9406c9a6c1d7e56284b5cbd3ce66",
    ("EB", "MaliciousUser", "REC", "SeqB", True, False, False): "7d10d74a96ad4e6d2acfab3ba2a0b1203d67faed39fa393a7b57775f109604a7",
    ("EB", "MaliciousUser", "REC", "SeqB", False, False, False): "06e2a41046de95a64a7148ae0e4d7ca86e053da5b8c72fae5f1ccaa10885f0b7",
    ("EB", "MaliciousUser", "REC", "PostM", True, True, True): "0022d77e0a6bc36a2c2e9867f52381e340d6605b7d1d59fd14f4ce1093abd6c5",
    ("EB", "MaliciousUser", "REC", "PostM", True, False, False): "e04e170908aefa5bff3ef9886eacabcc4bf0b5a611dcc81414cc5f403d3e526e",
    ("EB", "MaliciousUser", "REC", "PostM", False, False, False): "729ff97004bdea4f1bd2b05e9bd5cb992ef0b778d31a95a0176c7ce54deddd2d",
    ("EB", "MaliciousUser", "TWEC", "SeqA", True, True, True): "f110ce4b79a9c44ead18c3df3c86f693cb6bfb5c41f10a7513f54ee6491282b1",
    ("EB", "MaliciousUser", "TWEC", "SeqA", True, False, False): "643f73c02a5c900e1851db02f214763b5aac1e7b775bdf5586afad2e772d09e3",
    ("EB", "MaliciousUser", "TWEC", "SeqA", False, False, False): "18bd1b19ba73600cdabd3110afbfc6d992f591322fefe67f50684a0d97147db6",
    ("EB", "MaliciousUser", "TWEC", "SeqB", True, True, True): "4e3cea366e4bc38cb6ec85dd6671ff7d168783ec4eef1f2a53b053924efa51a0",
    ("EB", "MaliciousUser", "TWEC", "SeqB", True, False, False): "c430c4795cc13c05d07f91218eb1e2627dbe3a181e1fbc4c3983958b462b59b2",
    ("EB", "MaliciousUser", "TWEC", "SeqB", False, False, False): "d32d2d12d7bb787c57691c755b644df049bbd691e2ba375f075777235a2229e3",
    ("EB", "MaliciousUser", "TWEC", "PostM", True, True, True): "1e06ef4bf05745996afc779ce5d6e79c1157326fcab61854a9b2c41c5889b859",
    ("EB", "MaliciousUser", "TWEC", "PostM", True, False, False): "3f60caad2f83d27def7012fcfb4a4018948ac678bb9744f4a0516a9cee4a25b6",
    ("EB", "MaliciousUser", "TWEC", "PostM", False, False, False): "ad0436c7867ded57cfb43c8258c1146a8bb3b746878f01658efdb41104058753",
}


def _options(family, adv, er, bo, exec_, secrecy, auth, cm1=False, cm2=False):
    return {"type": family, "adv": adv, "er": er, "bo": bo, "exec": exec_, "secrecy": secrecy, "auth": auth, "cm1": cm1, "cm2": cm2}


def _tamarin(path, timeout=300):
    """Load a theory without proving; return (returncode, combined output)."""
    # Tamarin 1.12 aborts under --quit-on-warning when its derivation check (5 s by default) times
    # out, which the unchanged baseline models also trigger on a loaded machine; give it a budget.
    cmd = ["tamarin-prover", "--quit-on-warning", "--derivcheck-timeout=180", str(path)]
    cores = os.environ.get("TAMARIN_CORES")
    if cores and cores.isdigit():
        cmd += ["+RTS", f"-N{cores}", "-RTS"]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    return proc.returncode, proc.stdout + proc.stderr


class AssemblyRegressionTests(unittest.TestCase):
    def test_false_false_is_byte_identical_to_pre_change_output(self):
        for key, digest in PRE_CHANGE_SHA256.items():
            theory, _path, _label = registry.assemble("qkd", _options(*key))
            self.assertEqual(sha256(theory.encode()).hexdigest(), digest, f"assembly changed for {key}")

    def test_defaults_keep_cm_off(self):
        options = registry.normalize("qkd", {})
        self.assertFalse(options["cm1"])
        self.assertFalse(options["cm2"])
        self.assertEqual(qkd.cm_label(options), "baseline")
        self.assertNotIn("cm", qkd.file_name(options))

    def test_grid_has_36_points_and_presets(self):
        grid = registry.grid("qkd")
        self.assertEqual(len(grid), 36)
        self.assertEqual(len({(g["type"], g["er"], g["bo"], g["cm1"], g["cm2"]) for g in grid}), 36)
        self.assertTrue(all(g["exec"] and g["secrecy"] and g["auth"] for g in grid))
        names = {qkd.file_name(g) for g in grid}
        self.assertEqual(len(names), 36)
        labels = {p["label"] for p in qkd.PROTOCOL["presets"]}
        self.assertIn("A2B with CM1", labels)
        self.assertIn("A2B with CM1+CM2", labels)

    def test_expectations_cover_every_cell(self):
        rows = qkd.PROTOCOL["expectations"]
        self.assertEqual(len(rows), 9 * 4 * 9)
        v2 = [r for r in rows if r["type"] == "PM" and r["bo"] == "SeqA" and r["er"] == "FEC" and r["lemma"] == "secret_key_A"]
        by_cm = {r["cm"]: r for r in v2}
        self.assertEqual((by_cm["baseline"]["paper"], by_cm["baseline"]["vuln"]), ("falsified", "V2"))
        self.assertEqual(by_cm["CM1"]["paper"], "verified")
        self.assertEqual((by_cm["CM2"]["paper"], by_cm["CM2"]["vuln"]), ("falsified", "V2"))
        self.assertEqual(by_cm["CM1+CM2"]["paper"], "verified")
        self.assertEqual(by_cm["baseline"]["source"], "table")
        self.assertEqual(by_cm["CM1"]["source"], "prose")


class FragmentTests(unittest.TestCase):
    def test_cm2_theory_has_identity_and_role_bound_mac(self):
        for family, bo in (("PM", "SeqA"), ("EB", "PostM")):
            for adv in ("Network", "MaliciousUser"):
                theory, path, label = registry.assemble("qkd", _options(family, adv, "FEC", bo, True, True, True, cm2=True))
                self.assertIn("tag=mac(<roleA,rA,roleB,mtype,msg>,key_roleA)", theory, label)
                self.assertIn("Eq(<roleA,rA,roleB,mtype,msg>,verified), Neq(rA,rB)", theory, label)
                self.assertIn("!AuthSession(roleB,key_roleB,rB)", theory, label)
                self.assertIn("!AuthSession('A',psk(~sid),'initiator')", theory, label)
                self.assertIn("!AuthSession('B',psk(~sid),'responder')", theory, label)
                self.assertNotIn("tag=mac(msg,key_roleA)", theory, label)
                self.assertIn("equations: verifymac(mac(msg,psk(id)),psk(id))=msg", theory, label)
                self.assertIn("/ CM2", label)
                self.assertTrue(path.name.endswith("_cm2.spthy"), path.name)
                self.assertNotIn("ToCommitA", theory)

    def test_cm1_theory_has_commit_rules(self):
        for family, bo in (("PM", "SeqA"), ("EB", "PostM")):
            theory, path, label = registry.assemble("qkd", _options(family, "Network", "FEC", bo, True, True, True, cm1=True))
            self.assertIn("functions: h/1", theory)
            for rule in ("Alice_Send_CommitA", "Alice_Receive_CommitB", "Bob_Send_CommitB", "Bob_Receive_CommitA"):
                self.assertIn(f"rule {rule}:", theory, label)
            self.assertIn("Out_Auth('A',Y,cA,'commit')", theory)
            self.assertIn("Out_Auth('B',X,cB,'commit')", theory)
            self.assertIn("cA=h(KAraw)", theory)
            self.assertIn("cB=h(KBraw)", theory)
            # basis announcement consumes the peer's commitment
            send_ba = theory[theory.index("rule Alice_Send_BA:"):theory.index("Send_BA('A',Y,BA)")]
            self.assertIn("Alice_Received_CommitB('A',Y,", send_ba)
            send_bb = theory[theory.index("rule Bob_Send_BB:"):theory.index("Send_BB('B',X,BB)")]
            self.assertIn("Bob_Received_CommitA(X,'B',", send_bb)
            self.assertIn("ToCommitA('A',Y,~sid,KAraw)", theory)
            self.assertIn("ToCommitB(X,'B',~sid,KBraw)", theory)
            # lemmas unchanged
            self.assertIn("lemma secret_key_A:", theory)
            self.assertIn("lemma noninjectiveagreement_B:", theory)
            self.assertNotIn("Neq(rA,rB)", theory)
            self.assertIn("/ CM1", label)
            self.assertTrue(path.name.endswith("_cm1.spthy"), path.name)

    def test_both_flags_label_and_file_name(self):
        options = _options("PM", "Network", "FEC", "SeqA", True, True, True, cm1=True, cm2=True)
        self.assertEqual(qkd.cm_label(options), "CM1+CM2")
        self.assertEqual(qkd.label(options), "PM / Network / FEC / A2B / CM1+CM2")
        self.assertEqual(qkd.file_name(options), "qkd_PM_Network_FEC_SeqA_true_true_true_cm1_cm2.spthy")
        self.assertIn("--define=CM1=true", qkd.m4_defines(options))
        self.assertIn("--define=CM2=true", qkd.m4_defines(options))


class WellformednessTests(unittest.TestCase):
    """tamarin-prover --quit-on-warning without --prove must accept PM and EB with both flags on.

    Tamarin 1.12 reports a "Derivation checks timed out" warning for the unchanged baseline
    models as well (private measure/mac symbols) when the check exceeds its budget, so that one
    message is tolerated if it still appears; any other wellformedness failure is an error.
    """

    def _check(self, family, bo):
        _theory, path, label = registry.assemble("qkd", _options(family, "Network", "FEC", bo, True, True, True, cm1=True, cm2=True))
        code, log = _tamarin(path)
        if code != 0:
            self.assertIn("Derivation checks timed out", log, f"{label}: tamarin exit {code}\n{log[-2000:]}")
        self.assertIn("summary of summaries", log, label)
        if "wellformedness checks failed" in log:
            problems = log.split("WARNING: the following wellformedness checks failed!", 1)[1].split("maude tool", 1)[0]
            # the only tolerated complaint is the derivation-check budget; nothing else may be listed
            self.assertIn("Derivation checks timed out", problems, label)
            headings = [line for line in problems.splitlines() if line and set(line.strip()) == {"="}]
            self.assertEqual(len(headings), 1, f"{label}: other wellformedness problems\n{problems}")
        else:
            self.assertIn("All wellformedness checks were successful", log, label)

    def test_pm_cm1_cm2_wellformed(self):
        self._check("PM", "SeqA")

    def test_eb_cm1_cm2_wellformed(self):
        self._check("EB", "PostM")


if __name__ == "__main__":
    unittest.main()

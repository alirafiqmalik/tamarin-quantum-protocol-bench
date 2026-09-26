changequote(<!,!>)
define(`type', `ifelse(
`$1',`PM',PM,
`$1',`EB',EB,)'
)
define(`ER', `ifelse(
`$1',`FEC',FEC,
`$1',`REC',REC,
`$1',`TWEC',TWEC,)'
)
define(`BO', `ifelse(
`$1',`SeqA',SeqA,
`$1',`SeqB',SeqB,
`$1',`PostM',PostM,)'
)
define(`Adv', `ifelse(
`$1',`Network',Network,
`$1',`EB',EB,)'
)
theory type<!_protocol!>
begin


include(generic_models/type/primitives.spthy)
include(generic_models/common/restrictions.spthy)
include(generic_models/common/Basis_order/BO<!.spthy!>)


include(generic_models/type/<!Adv_!>Adv.spthy)
include(generic_models/type/Alice.spthy)
include(generic_models/type/Bob.spthy)

include(generic_models/common/<!ER!>/ER<!.spthy!>)

ifelse(exec,true,<!include(generic_models/lemmas/<!exec.spthy!>)!>, )
ifelse(secrecy,true,<!include(generic_models/lemmas/lemmas_secrecy.spthy)!>, )
ifelse(auth,true,<!include(generic_models/lemmas/lemmas_auth.spthy)!>, )

end

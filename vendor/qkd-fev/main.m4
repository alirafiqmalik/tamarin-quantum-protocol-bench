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
dnl Countermeasure switches (this demo's encoding of the paper's CM1/CM2).
dnl   CM1=true  adds the measurement-commitment phase (generic_models/common/CM/cm1_*.spthy)
dnl   CM2=true  swaps the authenticated channel for the identity- and role-bound MAC
dnl             (generic_models/common/CM/cm2_*.spthy) and tags !AuthSession with a role.
dnl Both default to false (an undefined flag is not equal to true), so the baseline text is unchanged.
define(<!CM1_ONLY!>, <!ifelse(CM1,true,<!$1!>)!>)dnl
define(<!CM2_ONLY!>, <!ifelse(CM2,true,<!$1!>)!>)dnl
define(<!CM2_ELSE!>, <!ifelse(CM2,true,<!$1!>,<!$2!>)!>)dnl
theory type<!_protocol!>
begin


include(generic_models/type/primitives.spthy)
include(generic_models/common/restrictions.spthy)
include(generic_models/common/Basis_order/BO<!.spthy!>)


include(generic_models/type/<!Adv_!>Adv.spthy)
include(generic_models/type/Alice.spthy)
include(generic_models/type/Bob.spthy)
ifelse(CM1,true,<!include(generic_models/common/CM/cm1_!>type<!.spthy)!>)dnl

include(generic_models/common/<!ER!>/ER<!.spthy!>)

ifelse(exec,true,<!include(generic_models/lemmas/<!exec.spthy!>)!>, )
ifelse(secrecy,true,<!include(generic_models/lemmas/lemmas_secrecy.spthy)!>, )
ifelse(auth,true,<!include(generic_models/lemmas/lemmas_auth.spthy)!>, )

end

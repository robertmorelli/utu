(module
  (rec
    (type $Utu1oqp5sdPairPair (struct
      (field $left i32)
      (field $right i32)
    ))
  )
  (func $__utu_pair_1oqp5sd_pair_left (param $self (ref $Utu1oqp5sdPairPair))  (result i32)
    local.get $self
    struct.get $Utu1oqp5sdPairPair $left
  )
  (func $__utu_pair_1oqp5sd_pair_new (param $l i32) (param $r i32)  (result (ref $Utu1oqp5sdPairPair))
    local.get $l
    local.get $r
    struct.new $Utu1oqp5sdPairPair
  )
  (func $main
    (local $p (ref $Utu1oqp5sdPairPair))
    (local $a i32)
    i32.const 1
    i32.const 2
    call $a_new
    local.set $p
    local.get $p
    call $__utu_pair_1oqp5sd_pair_left
    local.set $a
  )
  (export "main" (func $main))
  (func $a_new (param $l i32) (param $r i32)  (result (ref $Utu1oqp5sdPairPair))
    local.get $l
    local.get $r
    call $__utu_pair_1oqp5sd_pair_new
  )
)
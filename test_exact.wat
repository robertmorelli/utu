(module
  (rec
    (type $Utu101ahuvPairPair (struct
      (field $a i32)
      (field $b i32)
    ))
  )
  (func $__utu_pair_101ahuv_pair_left (param $self (ref $Utu101ahuvPairPair))  (result i32)
    local.get $self
    struct.get $Utu101ahuvPairPair $a
  )
  (func $__utu_pair_101ahuv_pair_new (param $a i32) (param $b i32)  (result (ref $Utu101ahuvPairPair))
    local.get $a
    local.get $b
    struct.new $Utu101ahuvPairPair
  )
  (func $main
    (local $p (ref $Utu101ahuvPairPair))
    (local $x i32)
    i32.const 1
    i32.const 2
    call $__utu_pair_101ahuv_pair_new
    local.set $p
    local.get $p
    call $__utu_pair_101ahuv_pair_left
    local.set $x
  )
  (export "main" (func $main))
)